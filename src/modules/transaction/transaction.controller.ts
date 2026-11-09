import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as transactionService from './transaction.service';
import { getUserWallet, getWalletByUserId } from '../wallet/wallet.service';

export async function listMine(req: Request, res: Response) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const walletId = req.query.walletId as string | undefined;

  // Defaults to the main wallet; another user's wallet id is a 404.
  const wallet = walletId
    ? await getUserWallet(req.user!.id, walletId)
    : await getWalletByUserId(req.user!.id);
  const result = await transactionService.listWalletTransactions(wallet.id, page, limit);
  return sendSuccess(res, result, 'Transactions fetched');
}
