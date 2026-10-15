import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as walletService from './wallet.service';
import { buildSessionResponse } from '../user/account-response';

export async function getMyWallet(req: Request, res: Response) {
  const wallet = await walletService.getWalletWithUserByUserId(req.user!.id);
  return sendSuccess(res, wallet, 'Wallet fetched');
}

export async function create(req: Request, res: Response) {
  const { user, wallet, created } = await walletService.createWalletForUser(req.user!.id);
  const message = created ? 'Wallet created' : 'Wallet already exists';
  const session = await buildSessionResponse(user);
  return sendSuccess(res, { ...session, wallet }, message, created ? 201 : 200);
}

export async function mockFund(req: Request, res: Response) {
  const wallet = await walletService.mockFundWallet(req.user!.id, req.body.amount);
  return sendSuccess(res, wallet, 'Wallet funded (mock)');
}
