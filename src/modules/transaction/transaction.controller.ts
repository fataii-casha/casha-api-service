import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as transactionService from './transaction.service';

export async function listMine(req: Request, res: Response) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const result = await transactionService.listMyTransactions(req.user!.id, page, limit);
  return sendSuccess(res, result, 'Transactions fetched');
}
