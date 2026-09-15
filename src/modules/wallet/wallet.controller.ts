import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as walletService from './wallet.service';

export async function getMyWallet(req: Request, res: Response) {
  const wallet = await walletService.getWalletByUserId(req.user!.id);
  return sendSuccess(res, wallet, 'Wallet fetched');
}

export async function mockFund(req: Request, res: Response) {
  const wallet = await walletService.mockFundWallet(req.user!.id, req.body.amount);
  return sendSuccess(res, wallet, 'Wallet funded (mock)');
}
