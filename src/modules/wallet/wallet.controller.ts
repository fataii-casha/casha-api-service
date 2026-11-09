import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as walletService from './wallet.service';
import * as stashService from './stash.service';
import { buildSessionResponse } from '../user/account-response';
import { toTransactionView } from '../transaction/transaction.service';

export async function getMyWallet(req: Request, res: Response) {
  const wallet = await walletService.getWalletWithAccountsByUserId(req.user!.id);
  return sendSuccess(res, walletService.toWalletView(wallet), 'Wallet fetched');
}

export async function create(req: Request, res: Response) {
  const { user, wallet, created } = await walletService.createWalletForUser(req.user!.id);
  const message = created ? 'Wallet created' : 'Wallet already exists';
  const session = await buildSessionResponse(user);
  return sendSuccess(
    res,
    { ...session, wallet: walletService.toWalletView(wallet) },
    message,
    created ? 201 : 200,
  );
}

export async function mockFund(req: Request, res: Response) {
  const wallet = await walletService.mockFundWallet(req.user!.id, req.body.amount);
  return sendSuccess(res, walletService.toWalletView(wallet), 'Wallet funded (mock)');
}

/** ?archived=true lists archived stashes (including ones pending deletion) instead. */
export async function list(req: Request, res: Response) {
  const archived = req.query.archived === 'true';
  const wallets = (await walletService.listUserWallets(req.user!.id)).filter(
    (wallet) => Boolean(wallet.archivedAt) === archived,
  );
  return sendSuccess(res, wallets.map(walletService.toWalletView), 'Wallets fetched');
}

export async function getOne(req: Request, res: Response) {
  const wallet = await walletService.getUserWallet(req.user!.id, req.params.walletId);
  return sendSuccess(res, walletService.toWalletView(wallet), 'Wallet fetched');
}

export async function createStash(req: Request, res: Response) {
  const stash = await stashService.createStash(req.user!.id, req.body);
  return sendSuccess(res, walletService.toWalletView(stash), 'Stash created', 201);
}

export async function update(req: Request, res: Response) {
  const wallet = await stashService.updateWalletAppearance(
    req.user!.id,
    req.params.walletId,
    req.body,
  );
  return sendSuccess(res, walletService.toWalletView(wallet), 'Wallet updated');
}

export async function archive(req: Request, res: Response) {
  const stash = await stashService.archiveStash(req.user!.id, req.params.walletId);
  return sendSuccess(res, walletService.toWalletView(stash), 'Stash archived');
}

export async function unarchive(req: Request, res: Response) {
  const stash = await stashService.unarchiveStash(req.user!.id, req.params.walletId);
  return sendSuccess(res, walletService.toWalletView(stash), 'Stash unarchived');
}

export async function remove(req: Request, res: Response) {
  const { stash, movedToMain } = await stashService.deleteStash(req.user!.id, req.params.walletId);
  return sendSuccess(
    res,
    { wallet: walletService.toWalletView(stash), movedToMain },
    'Stash deleted. It can be restored for 30 days.',
  );
}

export async function restore(req: Request, res: Response) {
  const stash = await stashService.restoreStash(req.user!.id, req.params.walletId);
  return sendSuccess(res, walletService.toWalletView(stash), 'Stash restored');
}

export async function transfer(req: Request, res: Response) {
  const { transaction, duplicate } = await stashService.moveBetweenOwnWallets(
    req.user!.id,
    req.body,
  );
  const [from, to] = await Promise.all([
    walletService.getUserWallet(req.user!.id, req.body.fromWalletId),
    walletService.getUserWallet(req.user!.id, req.body.toWalletId),
  ]);
  return sendSuccess(
    res,
    {
      transaction: await toTransactionView(transaction, from.id),
      from: walletService.toWalletView(from),
      to: walletService.toWalletView(to),
    },
    duplicate ? 'Transfer already processed' : 'Money moved',
    duplicate ? 200 : 201,
  );
}
