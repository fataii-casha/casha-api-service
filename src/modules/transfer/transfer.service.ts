import { EntityManager, IsNull } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/api-error';
import { normalizeNigerianPhone } from '../../utils/phone';
import { enforceRateLimit } from '../../utils/rate-limit';
import { OnboardingStep, User } from '../user/user.entity';
import { buildDisplayName } from '../user/account-response';
import { Wallet, WalletStatus, WalletType } from '../wallet/wallet.entity';
import { WalletAccount } from '../wallet/walletAccount.entity';
import { getUserWallet, getWalletByUserId, toWalletView } from '../wallet/wallet.service';
import { transferBetweenWallets } from '../ledger/ledger.service';
import { toTransactionView } from '../transaction/transaction.service';
import { verifyTransactionPin } from '../auth/auth.service';
import { formatNaira, getTransferLimits, TransferLimits } from './transfer-limits';

const userRepo = () => AppDataSource.getRepository(User);
const walletRepo = () => AppDataSource.getRepository(Wallet);
const accountRepo = () => AppDataSource.getRepository(WalletAccount);

// Recipient lookups return a name for a phone/account number, so they are capped to stop
// anyone walking the number space to harvest names.
const LOOKUP_LIMIT = { max: 30, windowSeconds: 15 * 60 };
const TRANSFER_LIMIT = { max: 10, windowSeconds: 60 };

// Debits that count towards the daily limit. Moves between your own wallets don't.
const LIMITED_DEBIT_TYPES = ['p2p_transfer', 'qr_payment', 'withdrawal'];

const RECIPIENT_NOT_FOUND = 'No Casha account found for these details';

export interface RecipientQuery {
  phone?: string;
  accountNumber?: string;
}

export interface SendTransferInput {
  senderId: string;
  recipientId: string;
  amount: number; // kobo
  pin: string;
  idempotencyKey: string;
  narration?: string;
  fromWalletId?: string; // defaults to the sender's main wallet
  context: { ip?: string; userAgent?: string };
}

/** +2348031234567 → +234803****567 */
function maskPhone(phone: string): string {
  return `${phone.slice(0, 7)}****${phone.slice(-3)}`;
}

/** A user who can receive transfers: active, fully onboarded, with an open main wallet. */
export async function findEligibleRecipient(where: { id?: string; phone?: string }) {
  const user = await userRepo().findOne({ where });
  if (!user || !user.isActive || user.onboardingStep !== OnboardingStep.COMPLETED) return null;

  const main = await walletRepo().findOne({
    where: { userId: user.id, type: WalletType.MAIN, deletedAt: IsNull() },
  });
  if (!main || main.status === WalletStatus.CLOSED) return null;

  return { user, main };
}

function toRecipientView(user: User) {
  return {
    id: user.id,
    name: buildDisplayName(user),
    accountType: user.role,
    phone: maskPhone(user.phone),
  };
}

/** Name enquiry: who will receive the money? Shown on the confirm screen before the PIN. */
export async function lookupRecipient(userId: string, query: RecipientQuery) {
  await enforceRateLimit(
    `transfer-lookup:${userId}`,
    LOOKUP_LIMIT.max,
    LOOKUP_LIMIT.windowSeconds,
    'Too many recipient lookups.',
  );

  let recipient: Awaited<ReturnType<typeof findEligibleRecipient>> = null;
  if (query.phone) {
    recipient = await findEligibleRecipient({ phone: normalizeNigerianPhone(query.phone) });
  } else if (query.accountNumber) {
    const account = await accountRepo().findOne({
      where: { accountNumber: query.accountNumber },
      relations: { wallet: true },
    });
    if (account?.wallet.type === WalletType.MAIN) {
      recipient = await findEligibleRecipient({ id: account.wallet.userId });
    }
  }

  // Same 404 for unknown, inactive and not-yet-onboarded accounts: nothing about their state leaks.
  if (!recipient) {
    throw ApiError.notFound(RECIPIENT_NOT_FOUND);
  }
  if (recipient.user.id === userId) {
    throw ApiError.badRequest(
      "That's your own account. To move money between your wallets, use a wallet transfer.",
    );
  }

  return toRecipientView(recipient.user);
}

export function assertAmountWithinLimits(amount: number, limits: TransferLimits) {
  if (amount < limits.minAmount) {
    throw ApiError.badRequest(`The minimum transfer is ${formatNaira(limits.minAmount)}`, {
      code: 'AMOUNT_TOO_SMALL',
      minAmount: limits.minAmount,
    });
  }
  if (amount > limits.singleMax) {
    throw ApiError.badRequest(
      `The most you can send in one transfer is ${formatNaira(limits.singleMax)}`,
      { code: 'SINGLE_LIMIT_EXCEEDED', singleMax: limits.singleMax },
    );
  }
}

/** Total the user has sent today (Africa/Lagos day), pending and successful debits. */
async function sentToday(manager: EntityManager, userId: string): Promise<number> {
  const [row] = await manager.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
      WHERE "senderUserId" = $1
        AND type = ANY($2)
        AND status IN ('pending', 'success')
        AND "createdAt" >= (date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`,
    [userId, LIMITED_DEBIT_TYPES],
  );
  return Number(row.total);
}

/**
 * The sender as of now — the token says onboarding is complete, but a deactivated user's
 * access token stays valid until it expires — plus their limits.
 */
export async function loadSenderForTransfer(senderId: string) {
  const sender = await userRepo().findOne({ where: { id: senderId } });
  if (!sender || !sender.isActive) {
    throw ApiError.forbidden('Your account is restricted. Contact support.');
  }
  const limits = getTransferLimits(sender);
  if (!limits) {
    throw ApiError.forbidden('Verify your BVN to send money');
  }
  return { sender, limits };
}

/**
 * For a posting's beforeLock: locks the sender's user row, serialising their transfers
 * (across all their wallets) so daily-limit sums can't be raced, and re-checks the account.
 */
export async function lockSenderRow(manager: EntityManager, senderId: string) {
  const [locked] = await manager.query(
    `SELECT "isActive" FROM users WHERE id = $1 FOR NO KEY UPDATE`,
    [senderId],
  );
  if (!locked?.isActive) {
    throw ApiError.forbidden('Your account is restricted. Contact support.');
  }
}

/** For a posting's guard (sender row already locked). */
export async function assertWithinDailyLimit(
  manager: EntityManager,
  senderId: string,
  amount: number,
  limits: TransferLimits,
) {
  const spent = await sentToday(manager, senderId);
  if (spent + amount > limits.dailyMax) {
    const remaining = Math.max(0, limits.dailyMax - spent);
    throw ApiError.badRequest(
      `This transfer would exceed your daily limit of ${formatNaira(limits.dailyMax)}. You can send ${formatNaira(remaining)} more today.`,
      { code: 'DAILY_LIMIT_EXCEEDED', dailyMax: limits.dailyMax, remaining },
    );
  }
}

export async function verifyPinOrThrow(userId: string, pin: string) {
  if (!(await verifyTransactionPin(userId, pin))) {
    throw ApiError.badRequest('Incorrect PIN', { code: 'INCORRECT_PIN' });
  }
}

async function totalHeldBy(manager: EntityManager, userId: string): Promise<number> {
  const [row] = await manager.query(
    `SELECT COALESCE(SUM("ledgerBalance"), 0) AS total FROM wallets WHERE "userId" = $1 AND "deletedAt" IS NULL`,
    [userId],
  );
  return Number(row.total);
}

/**
 * Sends money from one Casha user to another. Checks, in order: rate limit, sender account,
 * PIN, recipient, KYC limits; then — inside the posting's DB transaction, with the sender's
 * user row and both wallets locked so parallel requests can't slip past — the daily limit
 * and the recipient's balance cap. Idempotent on (sender, idempotencyKey).
 */
export async function sendTransfer(input: SendTransferInput) {
  const { senderId, amount } = input;

  await enforceRateLimit(
    `transfer:${senderId}`,
    TRANSFER_LIMIT.max,
    TRANSFER_LIMIT.windowSeconds,
    'Too many transfers in a short time.',
  );

  const { limits } = await loadSenderForTransfer(senderId);
  if (input.recipientId === senderId) {
    throw ApiError.badRequest(
      "You can't send money to yourself. To move money between your wallets, use a wallet transfer.",
    );
  }
  assertAmountWithinLimits(amount, limits);

  await verifyPinOrThrow(senderId, input.pin);

  const recipient = await findEligibleRecipient({ id: input.recipientId });
  if (!recipient) {
    throw ApiError.notFound(RECIPIENT_NOT_FOUND);
  }
  const recipientLimits = getTransferLimits(recipient.user);

  const from = input.fromWalletId
    ? await getUserWallet(senderId, input.fromWalletId)
    : await getWalletByUserId(senderId);

  const { transaction, duplicate } = await transferBetweenWallets({
    type: 'p2p_transfer',
    fromWalletId: from.id,
    toWalletId: recipient.main.id,
    amount,
    // Namespaced by sender so one user's key can never collide with another's.
    reference: `p2p_${senderId}_${input.idempotencyKey}`,
    narration: input.narration,
    metadata: {
      channel: 'app',
      sourceWalletType: from.type,
      ip: input.context.ip,
      userAgent: input.context.userAgent?.slice(0, 200),
    },

    beforeLock: (manager) => lockSenderRow(manager, senderId),

    guard: async (manager) => {
      await assertWithinDailyLimit(manager, senderId, amount, limits);

      const cap = recipientLimits?.maxBalance;
      if (cap != null && (await totalHeldBy(manager, recipient.user.id)) + amount > cap) {
        // Don't reveal the recipient's tier or balance.
        throw ApiError.badRequest("The recipient's account can't receive this amount right now", {
          code: 'RECIPIENT_LIMIT_EXCEEDED',
        });
      }
    },
  });

  // A retried key must describe the same transfer; otherwise it's a client bug, not a retry.
  if (
    duplicate &&
    (transaction.receiverUserId !== recipient.user.id || transaction.senderWalletId !== from.id)
  ) {
    throw ApiError.conflict('This idempotency key was already used for a different transaction');
  }

  logger.info(
    {
      transfer: {
        transactionId: transaction.id,
        senderId,
        recipientId: recipient.user.id,
        fromWalletId: from.id,
        amount,
        duplicate,
      },
    },
    duplicate ? 'P2P transfer retried (already posted)' : 'P2P transfer posted',
  );

  const updatedFrom = await getUserWallet(senderId, from.id);
  return {
    duplicate,
    transaction: await toTransactionView(transaction, from.id),
    wallet: toWalletView(updatedFrom),
    recipient: toRecipientView(recipient.user),
  };
}
