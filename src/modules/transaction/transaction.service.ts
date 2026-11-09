import { In } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Transaction } from './transaction.entity';
import { User } from '../user/user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { buildDisplayName } from '../user/account-response';
import { EntryDirection, LedgerEntry } from '../ledger/ledger-entry.entity';

const transactionRepo = () => AppDataSource.getRepository(Transaction);
const userRepo = () => AppDataSource.getRepository(User);
const walletRepo = () => AppDataSource.getRepository(Wallet);
const ledgerEntryRepo = () => AppDataSource.getRepository(LedgerEntry);

/** The wallet's own ledger entry for each transaction, keyed by transaction id. */
async function loadWalletEntries(transactions: Transaction[], walletId: string) {
  if (!transactions.length) return new Map<string, LedgerEntry>();

  const entries = await ledgerEntryRepo().find({
    where: { transactionId: In(transactions.map((tx) => tx.id)), walletId },
  });
  return new Map(entries.map((entry) => [entry.transactionId, entry]));
}

/** Moves between two wallets of the same user (main ↔ stash, and their reversals). */
function isBetweenOwnWallets(tx: Transaction) {
  return Boolean(tx.senderUserId) && tx.senderUserId === tx.receiverUserId;
}

/**
 * Transactions as seen from one wallet: direction is relative to it, balanceBefore/After are
 * its ledger balance around the transaction (null while pending, or if it failed), and the
 * counterparty is the other Casha user — or, for moves between the user's own wallets, the
 * other wallet. null for bank funding/withdrawals.
 */
async function toTransactionViews(transactions: Transaction[], walletId: string) {
  const entries = await loadWalletEntries(transactions, walletId);

  const sides = transactions.map((tx) => {
    const entry = entries.get(tx.id);
    const isCredit = entry
      ? entry.direction === EntryDirection.CREDIT
      : tx.receiverWalletId === walletId;
    return {
      tx,
      entry,
      isCredit,
      otherUserId: isCredit ? tx.senderUserId : tx.receiverUserId,
      otherWalletId: isCredit ? tx.senderWalletId : tx.receiverWalletId,
    };
  });

  const userIds = new Set<string>();
  const walletIds = new Set<string>();
  for (const side of sides) {
    if (isBetweenOwnWallets(side.tx)) {
      if (side.otherWalletId) walletIds.add(side.otherWalletId);
    } else if (side.otherUserId) {
      userIds.add(side.otherUserId);
    }
  }

  const [users, wallets] = await Promise.all([
    userIds.size ? userRepo().find({ where: { id: In([...userIds]) } }) : [],
    walletIds.size ? walletRepo().find({ where: { id: In([...walletIds]) } }) : [],
  ]);
  const userNames = new Map(users.map((user) => [user.id, buildDisplayName(user)]));
  const walletNames = new Map(wallets.map((wallet) => [wallet.id, wallet.name]));

  return sides.map(({ tx, entry, isCredit, otherUserId, otherWalletId }) => {
    let counterparty: { kind: 'user' | 'wallet'; id: string; name: string } | null = null;
    if (isBetweenOwnWallets(tx)) {
      if (otherWalletId) {
        counterparty = {
          kind: 'wallet',
          id: otherWalletId,
          name: walletNames.get(otherWalletId) ?? 'Wallet',
        };
      }
    } else if (otherUserId) {
      counterparty = {
        kind: 'user',
        id: otherUserId,
        name: userNames.get(otherUserId) ?? 'Casha user',
      };
    }

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
      counterparty,
      walletId,
      parentTransactionId: tx.parentTransactionId ?? null,
      createdAt: tx.createdAt,
      completedAt: tx.completedAt ?? null,
    };
  });
}

/**
 * One wallet's transactions, newest first by when they hit that wallet's ledger (falling back
 * to creation time for pending/failed ones), so each row's balanceBefore is the next older
 * row's balanceAfter. A withdrawal moves to the top when it settles.
 */
function walletTransactionsQuery(walletId: string) {
  return transactionRepo()
    .createQueryBuilder('t')
    .leftJoin(
      LedgerEntry,
      'own_entry',
      'own_entry.transactionId = t.id AND own_entry.walletId = :walletId',
    )
    .addSelect('COALESCE(own_entry.createdAt, t.createdAt)', 'posted_at')
    .where('(t.senderWalletId = :walletId OR t.receiverWalletId = :walletId)', { walletId })
    .orderBy('posted_at', 'DESC');
}

/** Callers must check the wallet belongs to the user (wallet.service getUserWallet). */
export async function listWalletTransactions(walletId: string, page = 1, limit = 20) {
  // offset/limit, not skip/take: with a join, skip/take switches TypeORM to a two-query
  // mode that can't order by an expression. The join is at most one row per transaction.
  const [transactions, total] = await walletTransactionsQuery(walletId)
    .offset((page - 1) * limit)
    .limit(limit)
    .getManyAndCount();

  return {
    items: await toTransactionViews(transactions, walletId),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getRecentTransactions(walletId: string, limit = 10) {
  const transactions = await walletTransactionsQuery(walletId).limit(limit).getMany();
  return toTransactionViews(transactions, walletId);
}

/** A single transaction as seen from one wallet. */
export async function toTransactionView(transaction: Transaction, walletId: string) {
  const [view] = await toTransactionViews([transaction], walletId);
  return view;
}
