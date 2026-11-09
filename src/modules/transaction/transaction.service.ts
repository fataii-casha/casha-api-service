import { In } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Transaction } from './transaction.entity';
import { User } from '../user/user.entity';
import { buildDisplayName } from '../user/account-response';
import { EntryDirection, LedgerEntry } from '../ledger/ledger-entry.entity';

const transactionRepo = () => AppDataSource.getRepository(Transaction);
const userRepo = () => AppDataSource.getRepository(User);
const ledgerEntryRepo = () => AppDataSource.getRepository(LedgerEntry);

/** The user's own wallet entry for each transaction, keyed by transaction id. */
async function loadOwnEntries(transactions: Transaction[], userId: string) {
  if (!transactions.length) return new Map<string, LedgerEntry>();

  const entries = await ledgerEntryRepo()
    .createQueryBuilder('entry')
    .innerJoin('entry.wallet', 'wallet')
    .where('entry.transactionId IN (:...ids)', { ids: transactions.map((tx) => tx.id) })
    .andWhere('wallet.userId = :userId', { userId })
    .getMany();
  return new Map(entries.map((entry) => [entry.transactionId, entry]));
}

/**
 * A transaction as seen by one user: direction is relative to them, the counterparty is the
 * other Casha user (null for external funding/withdrawals), and balanceBefore/balanceAfter
 * are their wallet's ledger balance around it — null while it is pending, or if it failed.
 */
async function toTransactionViews(transactions: Transaction[], userId: string) {
  const ownEntries = await loadOwnEntries(transactions, userId);
  const counterpartyIds = [
    ...new Set(
      transactions
        .map((tx) => (tx.receiverUserId === userId ? tx.senderUserId : tx.receiverUserId))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const counterparties = counterpartyIds.length
    ? await userRepo().find({ where: { id: In(counterpartyIds) } })
    : [];
  const nameById = new Map(counterparties.map((user) => [user.id, buildDisplayName(user)]));

  return transactions.map((tx) => {
    const entry = ownEntries.get(tx.id);
    const isCredit = entry
      ? entry.direction === EntryDirection.CREDIT
      : tx.receiverUserId === userId;
    const counterpartyId = isCredit ? tx.senderUserId : tx.receiverUserId;

    return {
      id: tx.id,
      reference: tx.reference,
      type: tx.type,
      direction: isCredit ? ('credit' as const) : ('debit' as const),
      amount: Number(tx.amount),
      currency: tx.currency,
      status: tx.status,
      balanceBefore: entry?.balanceBefore != null ? Number(entry.balanceBefore) : null,
      balanceAfter: entry?.balanceAfter != null ? Number(entry.balanceAfter) : null,
      narration: tx.narration ?? null,
      failureReason: tx.failureReason ?? null,
      counterparty: counterpartyId
        ? { id: counterpartyId, name: nameById.get(counterpartyId) ?? 'Casha user' }
        : null,
      parentTransactionId: tx.parentTransactionId ?? null,
      createdAt: tx.createdAt,
      completedAt: tx.completedAt ?? null,
    };
  });
}

/**
 * The user's transactions, newest first by when they hit the user's ledger (falling back to
 * creation time for pending/failed ones), so each row's balanceBefore is the next older
 * row's balanceAfter. A withdrawal moves to the top when it settles.
 */
function myTransactionsQuery(userId: string) {
  return transactionRepo()
    .createQueryBuilder('t')
    .leftJoin(
      LedgerEntry,
      'own_entry',
      'own_entry.transactionId = t.id AND own_entry.walletId IN (SELECT w.id FROM wallets w WHERE w."userId" = :userId)',
    )
    .addSelect('COALESCE(own_entry.createdAt, t.createdAt)', 'posted_at')
    .where('(t.senderUserId = :userId OR t.receiverUserId = :userId)', { userId })
    .orderBy('posted_at', 'DESC');
}

export async function listMyTransactions(userId: string, page = 1, limit = 20) {
  // offset/limit, not skip/take: with a join, skip/take switches TypeORM to a two-query
  // mode that can't order by an expression. The join is at most one row per transaction.
  const [transactions, total] = await myTransactionsQuery(userId)
    .offset((page - 1) * limit)
    .limit(limit)
    .getManyAndCount();

  return {
    items: await toTransactionViews(transactions, userId),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getRecentTransactions(userId: string, limit = 10) {
  const transactions = await myTransactionsQuery(userId).limit(limit).getMany();
  return toTransactionViews(transactions, userId);
}
