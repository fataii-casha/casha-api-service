import { EntityManager, QueryFailedError } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { ApiError } from '../../utils/api-error';
import { Wallet, WalletStatus } from '../wallet/wallet.entity';
import { Transaction, TransactionType } from '../transaction/transaction.entity';
import { EntryDirection, LedgerEntry, SystemAccount } from './ledger-entry.entity';

/*
 * The only code allowed to change wallet balances. Every posting runs in one DB transaction:
 * lock the wallets involved (SELECT ... FOR UPDATE, in id order so concurrent postings can't
 * deadlock), write the transaction row, move the balances and append the ledger entries.
 *
 * Postings are idempotent on `reference`: posting the same reference again (a webhook retry,
 * a double-tapped button) returns the original transaction instead of moving money twice.
 *
 * Two kinds of movement:
 *   - immediate (transfers, QR payments, bank funding): available and ledger balances move
 *     together and the transaction is created as success.
 *   - held (bank withdrawals): holdForBankDebit reduces only the available balance and leaves
 *     the transaction pending; settleHold then books it against the ledger balance, or
 *     releaseHold returns the funds if the bank transfer failed.
 */

interface PostingInput {
  reference: string;
  amount: number; // kobo
  narration?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferInput extends PostingInput {
  type: Extract<TransactionType, 'p2p_transfer' | 'qr_payment' | 'wallet_transfer'>;
  fromWalletId: string;
  toWalletId: string;
  qrCodeId?: string;
  /** Only for emptying a stash that is being deleted — archived stashes are otherwise frozen. */
  allowArchivedSource?: boolean;
}

export interface BankMovementInput extends PostingInput {
  walletId: string;
}

export interface PostingResult {
  transaction: Transaction;
  /** true when the reference had already been posted and nothing moved this time. */
  duplicate: boolean;
}

interface BalanceChange {
  available: bigint;
  ledger: bigint;
}

function toKobo(amount: number): bigint {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw ApiError.badRequest('Amount must be a positive whole number of kobo');
  }
  return BigInt(amount);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
  );
}

/** Runs `post` in a DB transaction unless `reference` was already posted. */
async function postOnce(
  reference: string,
  type: TransactionType,
  amount: bigint,
  post: (manager: EntityManager) => Promise<Transaction>,
): Promise<PostingResult> {
  const findExisting = async (manager: EntityManager) => {
    const existing = await manager.findOne(Transaction, { where: { reference } });
    if (existing && (existing.type !== type || existing.amount !== amount.toString())) {
      throw ApiError.conflict(`Reference ${reference} is already used by a different transaction`);
    }
    return existing;
  };

  try {
    return await AppDataSource.transaction(async (manager) => {
      const existing = await findExisting(manager);
      if (existing) return { transaction: existing, duplicate: true };
      return { transaction: await post(manager), duplicate: false };
    });
  } catch (err) {
    // A concurrent posting with the same reference committed first.
    if (isUniqueViolation(err)) {
      const existing = await findExisting(AppDataSource.manager);
      if (existing) return { transaction: existing, duplicate: true };
    }
    throw err;
  }
}

async function lockWallets(
  manager: EntityManager,
  walletIds: string[],
): Promise<Map<string, Wallet>> {
  const ids = [...new Set(walletIds)].sort();
  const wallets = await manager
    .getRepository(Wallet)
    .createQueryBuilder('wallet')
    .setLock('pessimistic_write')
    .where('wallet.id IN (:...ids)', { ids })
    .orderBy('wallet.id')
    .getMany();

  if (wallets.length !== ids.length) {
    throw ApiError.notFound('Wallet not found');
  }
  return new Map(wallets.map((wallet) => [wallet.id, wallet]));
}

async function lockTransaction(
  manager: EntityManager,
  transactionId: string,
): Promise<Transaction> {
  const transaction = await manager
    .getRepository(Transaction)
    .createQueryBuilder('transaction')
    .setLock('pessimistic_write')
    .where('transaction.id = :transactionId', { transactionId })
    .getOne();

  if (!transaction) {
    throw ApiError.notFound('Transaction not found');
  }
  return transaction;
}

function assertNotArchived(wallet: Wallet) {
  if (wallet.archivedAt) {
    throw ApiError.badRequest(
      wallet.deletionScheduledAt
        ? `"${wallet.name}" is being deleted. Restore it to use it.`
        : `"${wallet.name}" is archived. Unarchive it to use it.`,
    );
  }
}

function assertCanDebit(wallet: Wallet, { allowArchived = false } = {}) {
  if (wallet.status !== WalletStatus.ACTIVE) {
    throw ApiError.badRequest('Wallet is not active');
  }
  if (!allowArchived) assertNotArchived(wallet);
}

/** Suspended wallets still receive money (it arrived at the bank either way) — they just can't spend it. */
function assertCanCredit(wallet: Wallet) {
  if (wallet.status === WalletStatus.CLOSED) {
    throw ApiError.badRequest('Receiving wallet is closed');
  }
  assertNotArchived(wallet);
}

/**
 * Applies a change to a locked wallet's balances and, when the ledger balance moves, appends
 * the wallet's ledger entry with its balance before and after.
 */
async function moveWallet(
  manager: EntityManager,
  transaction: Transaction,
  wallet: Wallet,
  change: BalanceChange,
): Promise<void> {
  const availableAfter = BigInt(wallet.availableBalance) + change.available;
  const ledgerBefore = BigInt(wallet.ledgerBalance);
  const ledgerAfter = ledgerBefore + change.ledger;

  // The DB check constraints enforce the same rules; checking here gives a readable error.
  if (availableAfter < 0n) {
    throw ApiError.badRequest('Insufficient balance');
  }

  wallet.availableBalance = availableAfter.toString();
  wallet.ledgerBalance = ledgerAfter.toString();
  await manager.update(Wallet, wallet.id, {
    availableBalance: wallet.availableBalance,
    ledgerBalance: wallet.ledgerBalance,
  });

  if (change.ledger === 0n) return;

  await manager.insert(LedgerEntry, {
    transactionId: transaction.id,
    walletId: wallet.id,
    direction: change.ledger > 0n ? EntryDirection.CREDIT : EntryDirection.DEBIT,
    amount: (change.ledger > 0n ? change.ledger : -change.ledger).toString(),
    balanceBefore: ledgerBefore.toString(),
    balanceAfter: ledgerAfter.toString(),
  });
}

async function bookSystemEntry(
  manager: EntityManager,
  transaction: Transaction,
  systemAccount: SystemAccount,
  direction: EntryDirection,
  amount: bigint,
): Promise<void> {
  await manager.insert(LedgerEntry, {
    transactionId: transaction.id,
    systemAccount,
    direction,
    amount: amount.toString(),
  });
}

function createTransaction(manager: EntityManager, fields: Partial<Transaction>) {
  return manager.save(Transaction, manager.create(Transaction, fields));
}

/**
 * Wallet-to-wallet movement inside Casha (P2P transfer, QR payment, or main ↔ stash between a
 * user's own wallets). Settles immediately.
 */
export async function transferBetweenWallets(input: TransferInput): Promise<PostingResult> {
  const amount = toKobo(input.amount);
  if (input.fromWalletId === input.toWalletId) {
    throw ApiError.badRequest('Cannot transfer to the same wallet');
  }

  return postOnce(input.reference, input.type, amount, async (manager) => {
    const wallets = await lockWallets(manager, [input.fromWalletId, input.toWalletId]);
    const from = wallets.get(input.fromWalletId)!;
    const to = wallets.get(input.toWalletId)!;

    assertCanDebit(from, { allowArchived: input.allowArchivedSource });
    assertCanCredit(to);
    if (input.type === 'wallet_transfer' && from.userId !== to.userId) {
      throw ApiError.badRequest('Wallet transfers are only between your own wallets');
    }
    if (from.currency !== to.currency) {
      throw ApiError.badRequest('Wallets use different currencies');
    }

    const transaction = await createTransaction(manager, {
      reference: input.reference,
      type: input.type,
      amount: amount.toString(),
      currency: from.currency,
      senderWalletId: from.id,
      senderUserId: from.userId,
      receiverWalletId: to.id,
      receiverUserId: to.userId,
      qrCodeId: input.qrCodeId ?? null,
      narration: input.narration ?? null,
      metadata: input.metadata ?? null,
      status: 'success',
      completedAt: new Date(),
    });

    await moveWallet(manager, transaction, from, { available: -amount, ledger: -amount });
    await moveWallet(manager, transaction, to, { available: amount, ledger: amount });
    return transaction;
  });
}

/** Money received into the wallet from a bank (e.g. a transfer to its Stellas account). */
export async function creditWalletFromBank(input: BankMovementInput): Promise<PostingResult> {
  const amount = toKobo(input.amount);

  return postOnce(input.reference, 'funding', amount, async (manager) => {
    const wallet = (await lockWallets(manager, [input.walletId])).get(input.walletId)!;
    assertCanCredit(wallet);

    const transaction = await createTransaction(manager, {
      reference: input.reference,
      type: 'funding',
      amount: amount.toString(),
      currency: wallet.currency,
      receiverWalletId: wallet.id,
      receiverUserId: wallet.userId,
      narration: input.narration ?? null,
      metadata: input.metadata ?? null,
      status: 'success',
      completedAt: new Date(),
    });

    await bookSystemEntry(
      manager,
      transaction,
      SystemAccount.BANK_SETTLEMENT,
      EntryDirection.DEBIT,
      amount,
    );
    await moveWallet(manager, transaction, wallet, { available: amount, ledger: amount });
    return transaction;
  });
}

/**
 * First half of a bank withdrawal: puts the amount on hold (available balance drops, ledger
 * balance doesn't) and returns a pending transaction. Call settleHold or releaseHold once
 * the bank confirms or rejects the transfer.
 */
export async function holdForBankDebit(input: BankMovementInput): Promise<PostingResult> {
  const amount = toKobo(input.amount);

  return postOnce(input.reference, 'withdrawal', amount, async (manager) => {
    const wallet = (await lockWallets(manager, [input.walletId])).get(input.walletId)!;
    assertCanDebit(wallet);

    const transaction = await createTransaction(manager, {
      reference: input.reference,
      type: 'withdrawal',
      amount: amount.toString(),
      currency: wallet.currency,
      senderWalletId: wallet.id,
      senderUserId: wallet.userId,
      narration: input.narration ?? null,
      metadata: input.metadata ?? null,
      status: 'pending',
    });

    await moveWallet(manager, transaction, wallet, { available: -amount, ledger: 0n });
    return transaction;
  });
}

async function lockPendingHold(manager: EntityManager, transactionId: string) {
  const transaction = await lockTransaction(manager, transactionId);
  if (transaction.type !== 'withdrawal' || !transaction.senderWalletId) {
    throw ApiError.badRequest('Transaction is not a held withdrawal');
  }
  return transaction;
}

/** The bank confirmed the withdrawal: book it against the ledger balance. Safe to call twice. */
export async function settleHold(
  transactionId: string,
  metadata?: Record<string, unknown>,
): Promise<Transaction> {
  return AppDataSource.transaction(async (manager) => {
    const transaction = await lockPendingHold(manager, transactionId);
    if (transaction.status === 'success') return transaction;
    if (transaction.status !== 'pending') {
      throw ApiError.conflict(`Withdrawal is already ${transaction.status}`);
    }

    const amount = BigInt(transaction.amount);
    const walletId = transaction.senderWalletId!;
    const wallet = (await lockWallets(manager, [walletId])).get(walletId)!;

    await moveWallet(manager, transaction, wallet, { available: 0n, ledger: -amount });
    await bookSystemEntry(
      manager,
      transaction,
      SystemAccount.BANK_SETTLEMENT,
      EntryDirection.CREDIT,
      amount,
    );

    transaction.status = 'success';
    transaction.completedAt = new Date();
    transaction.metadata = { ...transaction.metadata, ...metadata };
    return manager.save(transaction);
  });
}

/** The bank rejected the withdrawal: give the held funds back. Safe to call twice. */
export async function releaseHold(transactionId: string, reason: string): Promise<Transaction> {
  return AppDataSource.transaction(async (manager) => {
    const transaction = await lockPendingHold(manager, transactionId);
    if (transaction.status === 'failed') return transaction;
    if (transaction.status !== 'pending') {
      throw ApiError.conflict(`Withdrawal is already ${transaction.status}`);
    }

    const walletId = transaction.senderWalletId!;
    const wallet = (await lockWallets(manager, [walletId])).get(walletId)!;
    await moveWallet(manager, transaction, wallet, {
      available: BigInt(transaction.amount),
      ledger: 0n,
    });

    transaction.status = 'failed';
    transaction.failureReason = reason;
    transaction.completedAt = new Date();
    return manager.save(transaction);
  });
}

/**
 * Undoes a successful transaction by posting a new 'reversal' transaction with the mirror
 * image of its ledger entries, and marks the original as reversed. Entries are never edited.
 * Fails with "Insufficient balance" if a wallet that received the money has since spent it.
 */
export async function reverseTransaction(
  transactionId: string,
  reason: string,
): Promise<PostingResult> {
  const original = await AppDataSource.getRepository(Transaction).findOne({
    where: { id: transactionId },
  });
  if (!original) {
    throw ApiError.notFound('Transaction not found');
  }
  if (original.type === 'reversal') {
    throw ApiError.badRequest('A reversal cannot itself be reversed');
  }

  const amount = BigInt(original.amount);
  const reference = `${original.reference}:reversal`;

  return postOnce(reference, 'reversal', amount, async (manager) => {
    const locked = await lockTransaction(manager, transactionId);
    if (locked.status !== 'success') {
      throw ApiError.badRequest(
        `Only successful transactions can be reversed (this one is ${locked.status})`,
      );
    }

    const entries = await manager.find(LedgerEntry, { where: { transactionId } });
    const walletIds = entries
      .map((entry) => entry.walletId)
      .filter((id): id is string => Boolean(id));
    const wallets = walletIds.length ? await lockWallets(manager, walletIds) : new Map();

    const reversal = await createTransaction(manager, {
      reference,
      type: 'reversal',
      amount: amount.toString(),
      currency: locked.currency,
      senderWalletId: locked.receiverWalletId ?? null,
      senderUserId: locked.receiverUserId ?? null,
      receiverWalletId: locked.senderWalletId ?? null,
      receiverUserId: locked.senderUserId ?? null,
      parentTransactionId: locked.id,
      narration: reason,
      status: 'success',
      completedAt: new Date(),
    });

    for (const entry of entries) {
      const entryAmount = BigInt(entry.amount);
      if (entry.walletId) {
        const signed = entry.direction === EntryDirection.CREDIT ? -entryAmount : entryAmount;
        await moveWallet(manager, reversal, wallets.get(entry.walletId)!, {
          available: signed,
          ledger: signed,
        });
      } else {
        const opposite =
          entry.direction === EntryDirection.CREDIT ? EntryDirection.DEBIT : EntryDirection.CREDIT;
        await bookSystemEntry(manager, reversal, entry.systemAccount!, opposite, entryAmount);
      }
    }

    locked.status = 'reversed';
    await manager.save(locked);
    return reversal;
  });
}

/**
 * Reconciliation check — every list should be empty. Wallets whose stored balances don't
 * match their ledger entries (and pending holds), and transactions whose entries don't
 * balance. Intended for a scheduled job or admin endpoint.
 */
export async function findLedgerDiscrepancies() {
  const signedAmount = `CASE direction WHEN 'credit' THEN amount ELSE -amount END`;

  const wallets = await AppDataSource.query(`
    SELECT w.id AS "walletId",
           w."ledgerBalance", w."availableBalance",
           COALESCE(e.net, 0) AS "computedLedgerBalance",
           COALESCE(e.net, 0) - COALESCE(h.held, 0) AS "computedAvailableBalance"
      FROM wallets w
      LEFT JOIN (SELECT "walletId", SUM(${signedAmount}) AS net
                   FROM ledger_entries WHERE "walletId" IS NOT NULL
                  GROUP BY "walletId") e ON e."walletId" = w.id
      LEFT JOIN (SELECT "senderWalletId", SUM(amount) AS held
                   FROM transactions WHERE type = 'withdrawal' AND status = 'pending'
                  GROUP BY "senderWalletId") h ON h."senderWalletId" = w.id
     WHERE w."ledgerBalance" <> COALESCE(e.net, 0)
        OR w."availableBalance" <> COALESCE(e.net, 0) - COALESCE(h.held, 0)`);

  const unbalancedTransactions = await AppDataSource.query(`
    SELECT "transactionId", SUM(${signedAmount}) AS net
      FROM ledger_entries
     GROUP BY "transactionId"
    HAVING SUM(${signedAmount}) <> 0`);

  return { wallets, unbalancedTransactions };
}
