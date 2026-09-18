import { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Wallet } from './wallet.entity';
import { ApiError } from '../../utils/api-error';
import { User } from '../user/user.entity';

function repo(manager: EntityManager = AppDataSource.manager) {
  return manager.getRepository(Wallet);
}
const userRepo = () => AppDataSource.getRepository(User);
const walletRepo = () => AppDataSource.getRepository(Wallet);

/** Lean lookup for internal use (debit/credit flows) — no user relation. */
export async function getWalletByUserId(userId: string, manager?: EntityManager): Promise<Wallet> {
  const wallet = await repo(manager).findOne({ where: { userId } });
  if (!wallet) {
    throw ApiError.notFound('Wallet not found for this user');
  }
  return wallet;
}

/** For the GET /wallets/me endpoint — includes the owning user's details. */
export async function getWalletWithUserByUserId(userId: string): Promise<Wallet> {
  const wallet = await repo().findOne({
    where: { userId },
    relations: { user: true },
  });

  if (!wallet) {
    throw ApiError.notFound('Wallet not found for this user');
  }

  return wallet;
}

/**
 * Creates the user's wallet — only allowed after BVN verification, per CBN KYC-tiering
 * rules for issuing a funded wallet. Idempotent: returns the existing wallet if one
 * was already created rather than erroring, so the client can safely retry.
 */
export async function createWalletForUser(
  userId: string,
): Promise<{ wallet: Wallet; created: boolean }> {
  const user = await userRepo().findOne({
    where: { id: userId },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (!user.bvnVerified) {
    throw ApiError.forbidden('Complete BVN verification before creating a wallet');
  }

  const existing = await walletRepo().findOne({
    where: { userId },
  });

  if (existing) {
    return {
      wallet: existing,
      created: false,
    };
  }

  const wallet = await walletRepo().save({
    userId,
    balance: '0',
    currency: 'NGN',
  });

  return {
    wallet,
    created: true,
  };
}

/** Debits a wallet atomically, guarding against overdraw at the query level. */
export async function debitWallet(
  walletId: string,
  amount: number,
  manager: EntityManager,
): Promise<Wallet> {
  const result = await manager
    .createQueryBuilder()
    .update(Wallet)
    .set({ balance: () => `balance - ${amount}` })
    .where('id = :walletId AND status = :status AND balance >= :amount', {
      walletId,
      status: 'active',
      amount,
    })
    .execute();

  if (result.affected === 0) {
    throw ApiError.badRequest('Insufficient balance or wallet is not active');
  }

  return repo(manager).findOneOrFail({ where: { id: walletId } });
}

export async function creditWallet(
  walletId: string,
  amount: number,
  manager: EntityManager,
): Promise<Wallet> {
  const result = await manager
    .createQueryBuilder()
    .update(Wallet)
    .set({ balance: () => `balance + ${amount}` })
    .where('id = :walletId AND status = :status', { walletId, status: 'active' })
    .execute();

  if (result.affected === 0) {
    throw ApiError.badRequest('Destination wallet is not active');
  }

  return repo(manager).findOneOrFail({ where: { id: walletId } });
}

/** Dev/test-only helper to simulate funding until a PSP is wired in. */
export async function mockFundWallet(userId: string, amount: number): Promise<Wallet> {
  return AppDataSource.transaction(async (manager) => {
    const wallet = await getWalletByUserId(userId, manager);
    return creditWallet(wallet.id, amount, manager);
  });
}
