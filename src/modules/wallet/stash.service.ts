import { randomUUID } from 'crypto';
import { IsNull, LessThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/api-error';
import { transferBetweenWallets } from '../ledger/ledger.service';
import { Wallet, WalletStatus, WalletType } from './wallet.entity';
import { getUserWallet, getWalletByUserId, listUserWallets } from './wallet.service';

const walletRepo = () => AppDataSource.getRepository(Wallet);

export const MAX_STASHES = 20;
export const STASH_DELETION_GRACE_DAYS = 30;

interface StashAppearance {
  name?: string;
  color?: string | null;
  icon?: string | null;
}

/** Names are unique per user (ignoring case) among wallets that still exist, main included. */
async function assertNameAvailable(userId: string, name: string, exceptWalletId?: string) {
  const taken = (await listUserWallets(userId)).some(
    (wallet) => wallet.id !== exceptWalletId && wallet.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    throw ApiError.conflict(`You already have a wallet called "${name}"`);
  }
}

async function getUserStash(userId: string, walletId: string): Promise<Wallet> {
  const wallet = await getUserWallet(userId, walletId);
  if (wallet.type !== WalletType.STASH) {
    throw ApiError.badRequest('Your main wallet cannot be archived or deleted');
  }
  return wallet;
}

function assertNoPendingTransactions(wallet: Wallet) {
  // availableBalance < ledgerBalance means money is on hold for an unfinished debit.
  if (wallet.availableBalance !== wallet.ledgerBalance) {
    throw ApiError.conflict(
      `"${wallet.name}" has a transaction in progress. Try again once it completes.`,
    );
  }
}

export async function createStash(
  userId: string,
  input: Required<Pick<StashAppearance, 'name'>> & StashAppearance,
) {
  const main = await getWalletByUserId(userId);
  const wallets = await listUserWallets(userId);

  if (wallets.filter((wallet) => wallet.type === WalletType.STASH).length >= MAX_STASHES) {
    throw ApiError.badRequest(`You can have up to ${MAX_STASHES} stashes`);
  }
  await assertNameAvailable(userId, input.name);

  const stash = await walletRepo().save(
    walletRepo().create({
      userId,
      type: WalletType.STASH,
      name: input.name,
      color: input.color ?? null,
      icon: input.icon ?? null,
      currency: main.currency,
    }),
  );
  return getUserWallet(userId, stash.id);
}

/** Rename / recolour / change icon. Works for the main wallet too. */
export async function updateWalletAppearance(
  userId: string,
  walletId: string,
  input: StashAppearance,
) {
  const wallet = await getUserWallet(userId, walletId);

  if (input.name !== undefined && input.name !== wallet.name) {
    await assertNameAvailable(userId, input.name, wallet.id);
    wallet.name = input.name;
  }
  if (input.color !== undefined) wallet.color = input.color;
  if (input.icon !== undefined) wallet.icon = input.icon;

  await walletRepo().save(wallet);
  return wallet;
}

/** Hides the stash and freezes it (no money in or out). The balance stays in it. */
export async function archiveStash(userId: string, walletId: string) {
  const stash = await getUserStash(userId, walletId);
  if (stash.deletionScheduledAt) {
    throw ApiError.conflict(`"${stash.name}" is being deleted. Restore it first.`);
  }
  if (stash.archivedAt) return stash;

  stash.archivedAt = new Date();
  await walletRepo().save(stash);
  return stash;
}

export async function unarchiveStash(userId: string, walletId: string) {
  const stash = await getUserStash(userId, walletId);
  if (stash.deletionScheduledAt) {
    throw ApiError.conflict(`"${stash.name}" is being deleted. Use restore instead.`);
  }
  if (!stash.archivedAt) return stash;

  stash.archivedAt = null;
  await walletRepo().save(stash);
  return stash;
}

/**
 * Deletes a stash: any balance moves to the main wallet first, then the stash is archived and
 * scheduled for permanent deletion in 30 days. Until then it can be restored.
 */
export async function deleteStash(userId: string, walletId: string) {
  let stash = await getUserStash(userId, walletId);
  if (stash.deletionScheduledAt) return { stash, movedToMain: 0 };
  assertNoPendingTransactions(stash);

  // Archive (freeze) first so no payment can land between reading the balance and moving it.
  // The update waits for any posting that already holds the wallet lock.
  const archivedAt = stash.archivedAt ?? new Date();
  await walletRepo().update(stash.id, { archivedAt });
  stash = await getUserStash(userId, walletId);
  assertNoPendingTransactions(stash);

  const movedToMain = Number(stash.availableBalance);
  if (movedToMain > 0) {
    const main = await getWalletByUserId(userId);
    await transferBetweenWallets({
      type: 'wallet_transfer',
      fromWalletId: stash.id,
      toWalletId: main.id,
      amount: movedToMain,
      reference: `stash_close_${randomUUID()}`,
      narration: `Closing "${stash.name}"`,
      metadata: { reason: 'stash_deleted' },
      allowArchivedSource: true,
    });
  }

  await walletRepo().update(stash.id, {
    deletionScheduledAt: new Date(Date.now() + STASH_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000),
  });
  return { stash: await getUserWallet(userId, stash.id), movedToMain };
}

/** Undoes a delete within the grace period. The stash comes back active (and empty). */
export async function restoreStash(userId: string, walletId: string) {
  const stash = await getUserStash(userId, walletId);
  if (!stash.deletionScheduledAt) {
    throw ApiError.badRequest(`"${stash.name}" is not deleted`);
  }

  stash.deletionScheduledAt = null;
  stash.archivedAt = null;
  await walletRepo().save(stash);
  return stash;
}

/** Moves money between two of the user's own wallets (main ↔ stash, stash ↔ stash). */
export async function moveBetweenOwnWallets(
  userId: string,
  input: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    narration?: string;
    idempotencyKey?: string;
  },
) {
  // Both lookups 404 for wallets that aren't the user's.
  const [from, to] = await Promise.all([
    getUserWallet(userId, input.fromWalletId),
    getUserWallet(userId, input.toWalletId),
  ]);

  const { transaction, duplicate } = await transferBetweenWallets({
    type: 'wallet_transfer',
    fromWalletId: from.id,
    toWalletId: to.id,
    amount: input.amount,
    // Namespaced by user so one user's key can never collide with another's.
    reference: `wt_${userId}_${input.idempotencyKey ?? randomUUID()}`,
    narration: input.narration ?? `${from.name} → ${to.name}`,
  });

  return { transaction, duplicate };
}

/**
 * Makes deletions permanent once the grace period is over: status closed, deletedAt set.
 * Rows are kept for the ledger history. Runs on a timer from server.ts; reads already treat
 * overdue stashes as deleted, so a late run is harmless.
 */
export async function finalizeDueStashDeletions(): Promise<number> {
  const due = await walletRepo().find({
    where: {
      type: WalletType.STASH,
      deletedAt: IsNull(),
      deletionScheduledAt: LessThanOrEqual(new Date()), // NULLs never match
    },
  });

  let finalized = 0;
  for (const stash of due) {
    if (stash.ledgerBalance !== '0') {
      // Can't happen through the API (deleting empties the stash, archived stashes are frozen).
      logger.error(
        { walletId: stash.id, ledgerBalance: stash.ledgerBalance },
        'ACTION NEEDED: stash due for deletion still holds money — skipped',
      );
      continue;
    }
    await walletRepo().update(stash.id, { status: WalletStatus.CLOSED, deletedAt: new Date() });
    finalized += 1;
  }

  if (finalized) logger.info({ finalized }, 'Finalized stash deletions');
  return finalized;
}
