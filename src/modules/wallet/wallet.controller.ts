import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as walletService from './wallet.service';

export async function getMyWallet(req: Request, res: Response) {
  const wallet = await walletService.getWalletWithUserByUserId(req.user!.id);
  return sendSuccess(res, wallet, 'Wallet fetched');
}

export async function create(req: Request, res: Response) {
  const { wallet, created } = await walletService.createWalletForUser(req.user!.id);
  const message = created ? 'Wallet created' : 'Wallet already exists';
  return sendSuccess(res, wallet, message, created ? 201 : 200);
}

export async function mockFund(req: Request, res: Response) {
  const wallet = await walletService.mockFundWallet(req.user!.id, req.body.amount);
  return sendSuccess(res, wallet, 'Wallet funded (mock)');
}
