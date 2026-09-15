import { AppDataSource } from '../../config/data-source';
import { Transaction } from './transaction.entity';

export async function listMyTransactions(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const repo = AppDataSource.getRepository(Transaction);

  const [items, total] = await repo
    .createQueryBuilder('t')
    .where('t.senderUserId = :userId OR t.receiverUserId = :userId', { userId })
    .orderBy('t.createdAt', 'DESC')
    .skip(skip)
    .take(limit)
    .getManyAndCount();

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}
