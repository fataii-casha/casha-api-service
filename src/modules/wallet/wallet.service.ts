import { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Wallet } from './wallet.entity';
import { ApiError } from '../../utils/api-error';

function repo(manager: EntityManager = AppDataSource.manager) {
  return manager.getRepository(Wallet);
}

export async function getWalletByUserId(userId: string, manager?: EntityManager): Promise<Wallet> {
  const wallet = await repo(manager).findOne({ where: { userId } });
  if (!wallet) {
    throw ApiError.notFound('Wallet not found for this user');
  }
  return wallet;
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
