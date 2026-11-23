import { createHash } from 'crypto';
import { LessThan } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { ApiError } from '../../utils/api-error';
import { enforceRateLimit } from '../../utils/rate-limit';
import {
  StellasBank,
  StellasRequestError,
  VirtualAccountTransferResult,
  stellasIntegration,
} from '../../integrations/stellas';
import { buildDisplayName } from '../user/account-response';
import { Transaction } from '../transaction/transaction.entity';
import { toTransactionView } from '../transaction/transaction.service';
import { WalletProvider } from '../wallet/wallet.entity';
import { WalletAccount } from '../wallet/walletAccount.entity';
import {
  getUserWallet,
  getWalletWithAccountsByUserId,
  toWalletView,
} from '../wallet/wallet.service';
import { holdForBankDebit, releaseHold, settleHold } from '../ledger/ledger.service';
import {
  assertAmountWithinLimits,
  assertWithinDailyLimit,
  findEligibleRecipient,
  loadSenderForTransfer,
  lockSenderRow,
  verifyPinOrThrow,
} from './transfer.service';

/*
 * Transfers to any Nigerian bank account (NIP), paid from the sender's own Stellas virtual
 * account. Flow:
 *   1. checks (rate limit, sender, limits, PIN, bank, not a Casha account)
 *   2. hold amount + fee in the ledger (pending withdrawal; daily limit checked under lock)
 *   3. call Stellas once — never again for the same transfer, even on retry
 *   4. Stellas says success → settle; failed → release the hold; pending or no clear answer →
 *      keep the hold until a status check / webhook resolves it (resolveBankTransfer).
 * Money is only returned when Stellas definitely did not act; an unknown outcome stays held.
 */

const accountRepo = () => AppDataSource.getRepository(WalletAccount);
const transactionRepo = () => AppDataSource.getRepository(Transaction);

const BANKS_CACHE_KEY = 'stellas:banks:nibss';
const BANKS_CACHE_SECONDS = 6 * 60 * 60;
const BANK_TRANSFER_LIMIT = { max: 5, windowSeconds: 60 };
const STUCK_AFTER_MINUTES = 15;

const SUCCESS_STATUSES = new Set(['success', 'successful', 'completed', 'approved']);
const FAILED_STATUSES = new Set(['failed', 'failure', 'declined', 'reversed', 'rejected']);

const NAIRA = 100;
/** Tiered like NIP: ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above. */
export function bankTransferFee(amountKobo: number): number {
  if (amountKobo <= 5_000 * NAIRA) return 10 * NAIRA;
  if (amountKobo <= 50_000 * NAIRA) return 25 * NAIRA;
  return 50 * NAIRA;
}

export interface Beneficiary {
  accountNumber: string;
  bankCode: string;
  bankName: string;
  accountName: string | null; // filled once name enquiry is wired in
}

export interface SendBankTransferInput {
  senderId: string;
  accountNumber: string;
  bankCode: string; // NIBSS code from GET /transfers/banks
  amount: number; // kobo
  pin: string;
  idempotencyKey: string;
  narration?: string;
  fromWalletId?: string;
  context: { ip?: string; userAgent?: string };
}

/** Banks from Stellas (NIBSS codes), sorted by name, cached for 6 hours. */
export async function listBanks(): Promise<StellasBank[]> {
  const cached = await redis.get(BANKS_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const banks = (await stellasIntegration.getBanks())
    .filter((bank) => bank.name && bank.bankCode)
    .map((bank) => ({ name: bank.name.trim(), bankCode: bank.bankCode.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  await redis.set(BANKS_CACHE_KEY, JSON.stringify(banks), 'EX', BANKS_CACHE_SECONDS);
  return banks;
}

/**
 * Deterministic per (sender, idempotencyKey), so a retry finds the same transfer. Also sent
 * to Stellas as retrievalReference, so it's short: "CSH" + 24 hex chars (96 bits).
 */
function bankTransferReference(senderId: string, idempotencyKey: string): string {
  const digest = createHash('sha256').update(`${senderId}:${idempotencyKey}`).digest('hex');
  return `CSH${digest.slice(0, 24).toUpperCase()}`;
}

async function mergeMetadata(transactionId: string, metadata: Record<string, unknown>) {
  await transactionRepo().query(
    `UPDATE transactions SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [transactionId, JSON.stringify(metadata)],
  );
}

/** Our virtual account at Stellas pays the transfer — the main wallet's account number. */
async function getPayerAccount(senderId: string) {
  const main = await getWalletWithAccountsByUserId(senderId);
  const account =
    main.accounts.find((a) => a.provider === WalletProvider.STELLAS && a.isPrimary) ??
    main.accounts.find((a) => a.provider === WalletProvider.STELLAS);
  if (!account) {
    throw ApiError.conflict(
      "Your Casha account number isn't ready yet, so you can't send to banks. Contact support.",
    );
  }
  return account;
}

/**
 * Sending to a Casha account through the bank would cost a fee for nothing — use a Casha
 * transfer. Recognised by Stellas' NIBSS code (STELLAS_BANK_CODE); the name match is a
 * fallback for when the code isn't configured.
 */
async function assertNotCashaAccount(senderId: string, accountNumber: string, bank: StellasBank) {
  const isStellasBank = env.stellasBankCode
    ? bank.bankCode === env.stellasBankCode
    : /stellas/i.test(bank.name);
  if (!isStellasBank) return;

  const accounts = await accountRepo().find({
    where: { accountNumber, provider: WalletProvider.STELLAS },
    relations: { wallet: true },
  });
  if (!accounts.length) return;

  if (accounts.some((account) => account.wallet.userId === senderId)) {
    throw ApiError.badRequest("That's your own Casha account", { code: 'OWN_ACCOUNT' });
  }
  const recipient = await findEligibleRecipient({ id: accounts[0].wallet.userId });
  throw ApiError.badRequest(
    "This is a Casha account. Send to it as a Casha transfer — it's free.",
    {
      code: 'CASHA_ACCOUNT',
      recipientId: recipient?.user.id ?? null,
    },
  );
}

async function buildResult(transaction: Transaction, senderId: string, fromWalletId: string) {
  const fresh = await transactionRepo().findOneByOrFail({ id: transaction.id });
  return {
    status: fresh.status,
    transaction: await toTransactionView(fresh, fromWalletId),
    wallet: toWalletView(await getUserWallet(senderId, fromWalletId)),
  };
}

export async function sendBankTransfer(input: SendBankTransferInput) {
  const { senderId, amount } = input;

  await enforceRateLimit(
    `bank-transfer:${senderId}`,
    BANK_TRANSFER_LIMIT.max,
    BANK_TRANSFER_LIMIT.windowSeconds,
    'Too many bank transfers in a short time.',
  );

  const { sender, limits } = await loadSenderForTransfer(senderId);
  assertAmountWithinLimits(amount, limits);
  await verifyPinOrThrow(senderId, input.pin);

  const bank = (await listBanks()).find((b) => b.bankCode === input.bankCode);
  if (!bank) {
    // Unknown codes aren't rejected by Stellas — they sit in pending — so check them here.
    throw ApiError.badRequest('Select a valid bank', { code: 'UNKNOWN_BANK' });
  }
  await assertNotCashaAccount(senderId, input.accountNumber, bank);

  const payer = await getPayerAccount(senderId);
  const from = input.fromWalletId
    ? await getUserWallet(senderId, input.fromWalletId)
    : await getWalletWithAccountsByUserId(senderId);

  const fee = bankTransferFee(amount);
  const beneficiary: Beneficiary = {
    accountNumber: input.accountNumber,
    bankCode: bank.bankCode,
    bankName: bank.name,
    accountName: null,
  };
  const reference = bankTransferReference(senderId, input.idempotencyKey);
  const narration = (
    input.narration ?? `Transfer from ${buildDisplayName(sender)} via Casha`
  ).slice(0, 100);

  const { transaction, duplicate } = await holdForBankDebit({
    walletId: from.id,
    amount,
    fee,
    reference,
    narration,
    metadata: {
      channel: 'app',
      provider: 'stellas',
      beneficiary,
      payerAccountNumber: payer.accountNumber,
      sourceWalletType: from.type,
      ip: input.context.ip,
      userAgent: input.context.userAgent?.slice(0, 200),
    },
    beforeLock: (manager) => lockSenderRow(manager, senderId),
    guard: (manager) => assertWithinDailyLimit(manager, senderId, amount, limits),
  });

  if (duplicate) {
    // A retry: report the transfer's current state. Never call Stellas a second time.
    const sent = transaction.metadata?.beneficiary as Beneficiary | undefined;
    if (
      sent?.accountNumber !== beneficiary.accountNumber ||
      sent?.bankCode !== beneficiary.bankCode ||
      transaction.senderWalletId !== from.id
    ) {
      throw ApiError.conflict('This idempotency key was already used for a different transaction');
    }
    return { duplicate, ...(await buildResult(transaction, senderId, from.id)) };
  }

  await dispatchToStellas(transaction, {
    amount,
    payerAccountNumber: payer.accountNumber,
    beneficiary,
    narration,
  });
  const result = await buildResult(transaction, senderId, from.id);

  logger.info(
    {
      bankTransfer: {
        transactionId: transaction.id,
        reference,
        senderId,
        amount,
        fee,
        bankCode: bank.bankCode,
        status: result.status,
      },
    },
    `Bank transfer ${result.status}`,
  );

  if (result.status === 'failed') {
    throw ApiError.badRequest(
      `Transfer failed: ${result.transaction.failureReason ?? 'the bank declined it'}. You have not been charged.`,
      { code: 'TRANSFER_FAILED', transaction: result.transaction },
    );
  }
  return { duplicate, ...result };
}

/** Calls Stellas and applies its answer to the held transaction. Never throws after the call. */
async function dispatchToStellas(
  transaction: Transaction,
  args: { amount: number; payerAccountNumber: string; beneficiary: Beneficiary; narration: string },
) {
  let result: VirtualAccountTransferResult;
  try {
    result = await stellasIntegration.transferFromVirtualAccount({
      amountKobo: args.amount,
      payerAccountNumber: args.payerAccountNumber,
      receiverAccountNumber: args.beneficiary.accountNumber,
      receiverBankCode: args.beneficiary.bankCode,
      retrievalReference: transaction.reference,
      narration: args.narration,
    });
  } catch (err) {
    if (err instanceof StellasRequestError && err.outcome === 'not_processed') {
      // Stellas definitely didn't act on it: give the money back.
      await releaseHold(transaction.id, 'the bank service could not process it', {
        providerError: err.providerError,
      });
      // Outages stay 503 (retry later); other rejections get a clean message — the raw
      // provider text can contain account numbers.
      if (err.statusCode === 503) throw err;
      throw ApiError.badRequest(
        'Transfer failed: the bank declined it. You have not been charged.',
        { code: 'TRANSFER_FAILED' },
      );
    }
    // Timeout / dropped connection / 5xx: it may have gone through. Keep the hold.
    logger.error(
      { err, transactionId: transaction.id, reference: transaction.reference },
      'ACTION NEEDED: bank transfer outcome unknown — left pending until confirmed',
    );
    await mergeMetadata(transaction.id, { providerOutcome: 'unknown' });
    return;
  }

  await applyProviderResult(transaction.id, result);
}

async function applyProviderResult(transactionId: string, result: VirtualAccountTransferResult) {
  const providerMetadata = {
    providerReference: result.providerReference,
    providerStatus: result.transactionStatus,
    providerMessage: result.message,
    providerCharge: result.chargeKobo,
  };

  try {
    if (SUCCESS_STATUSES.has(result.transactionStatus)) {
      await settleHold(transactionId, {
        providerCharge: result.chargeKobo,
        metadata: providerMetadata,
      });
    } else if (FAILED_STATUSES.has(result.transactionStatus)) {
      // The provider message can include our account numbers — keep it out of the user's view.
      const insufficient = /insufficient/i.test(result.message);
      if (insufficient) {
        logger.error(
          { transactionId, providerMessage: result.message },
          "ACTION NEEDED: payer virtual account at Stellas holds less than the user's Casha balance",
        );
      }
      await releaseHold(
        transactionId,
        insufficient ? 'the bank could not complete it right now' : 'the bank declined it',
        providerMetadata,
      );
    } else {
      // "pending", or a status we don't know yet: keep the hold until confirmed.
      if (result.transactionStatus !== 'pending') {
        logger.warn({ transactionId, ...providerMetadata }, 'Unrecognised Stellas transfer status');
      }
      await mergeMetadata(transactionId, providerMetadata);
    }
  } catch (err) {
    // Stellas answered, but we couldn't record it — reconcile by hand.
    logger.error(
      { err, transactionId, ...providerMetadata },
      'ACTION NEEDED: Stellas transfer result could not be applied to the ledger',
    );
  }
}

/**
 * Final status from a status check (requery) or webhook. Idempotent: applying the same final
 * status twice is a no-op, so webhook retries are safe.
 */
export async function resolveBankTransfer(
  reference: string,
  outcome: { status: 'success'; providerCharge: number } | { status: 'failed'; reason: string },
) {
  const transaction = await transactionRepo().findOne({ where: { reference, type: 'withdrawal' } });
  if (!transaction) {
    throw ApiError.notFound('Bank transfer not found');
  }
  return outcome.status === 'success'
    ? settleHold(transaction.id, { providerCharge: outcome.providerCharge })
    : releaseHold(transaction.id, outcome.reason);
}

/** Logs bank transfers still pending after 15 minutes. Runs on a timer from server.ts. */
export async function reportStuckBankTransfers(): Promise<number> {
  const stuck = await transactionRepo().find({
    where: {
      type: 'withdrawal',
      status: 'pending',
      createdAt: LessThan(new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000)),
    },
    order: { createdAt: 'ASC' },
    take: 100,
  });

  if (stuck.length) {
    logger.error(
      {
        stuck: stuck.map((tx) => ({
          transactionId: tx.id,
          reference: tx.reference,
          amount: Number(tx.amount),
          createdAt: tx.createdAt,
          providerReference: tx.metadata?.providerReference,
        })),
      },
      `ACTION NEEDED: ${stuck.length} bank transfer(s) pending for over ${STUCK_AFTER_MINUTES} minutes`,
    );
  }
  return stuck.length;
}
