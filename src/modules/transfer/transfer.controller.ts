import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as transferService from './transfer.service';
import * as bankTransferService from './bank-transfer.service';

export async function lookupRecipient(req: Request, res: Response) {
  const recipient = await transferService.lookupRecipient(req.user!.id, {
    phone: req.query.phone as string | undefined,
    accountNumber: req.query.accountNumber as string | undefined,
  });
  return sendSuccess(res, recipient, 'Recipient found');
}

export async function send(req: Request, res: Response) {
  const { duplicate, ...result } = await transferService.sendTransfer({
    senderId: req.user!.id,
    recipientId: req.body.recipientId,
    amount: req.body.amount,
    pin: req.body.pin,
    idempotencyKey: req.body.idempotencyKey,
    narration: req.body.narration,
    fromWalletId: req.body.fromWalletId,
    context: { ip: req.ip, userAgent: req.get('user-agent') },
  });
  return sendSuccess(
    res,
    result,
    duplicate ? 'Transfer already processed' : 'Transfer successful',
    duplicate ? 200 : 201,
  );
}

export async function listBanks(_req: Request, res: Response) {
  return sendSuccess(res, await bankTransferService.listBanks(), 'Banks fetched');
}

export async function bankFee(req: Request, res: Response) {
  const amount = Number(req.query.amount);
  const fee = bankTransferService.bankTransferFee(amount);
  return sendSuccess(res, { amount, fee, total: amount + fee }, 'Fee calculated');
}

export async function sendToBank(req: Request, res: Response) {
  const { duplicate, ...result } = await bankTransferService.sendBankTransfer({
    senderId: req.user!.id,
    accountNumber: req.body.accountNumber,
    bankCode: req.body.bankCode,
    amount: req.body.amount,
    pin: req.body.pin,
    idempotencyKey: req.body.idempotencyKey,
    narration: req.body.narration,
    fromWalletId: req.body.fromWalletId,
    context: { ip: req.ip, userAgent: req.get('user-agent') },
  });

  // 201 done, 202 accepted but still processing at the bank; 200 for a repeated key.
  const statusCode = duplicate ? 200 : result.status === 'success' ? 201 : 202;
  const message =
    result.status === 'success'
      ? 'Transfer successful'
      : 'Transfer is processing. We will update you once the bank confirms.';
  return sendSuccess(
    res,
    result,
    duplicate ? `Transfer already submitted: ${result.status}` : message,
    statusCode,
  );
}
