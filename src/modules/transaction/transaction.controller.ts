import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as transactionService from './transaction.service';

export async function payViaQr(req: Request, res: Response) {
  const transaction = await transactionService.payViaQr({
    payerId: req.user!.id,
    code: req.body.code,
    amount: req.body.amount,
    pin: req.body.pin,
  });
  return sendSuccess(res, transaction, 'Payment successful', 201);
}

export async function listMine(req: Request, res: Response) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const result = await transactionService.listMyTransactions(req.user!.id, page, limit);
  return sendSuccess(res, result, 'Transactions fetched');
}
