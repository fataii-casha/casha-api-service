import { randomUUID } from 'crypto';
import { AppDataSource } from '../../config/data-source';
import { Transaction } from './transaction.entity';
import { QrCode } from '../qr/qr.entity';
// import { resolveQrCode } from '../qr/qr.service';
import { getWalletByUserId, debitWallet, creditWallet } from '../wallet/wallet.service';
// import { verifyTransactionPin } from '../auth/auth.service';
import { ApiError } from '../../utils/api-error';

interface PayViaQrInput {
  payerId: string;
  code: string;
  amount?: number;
  pin: string;
}

export async function payViaQr(input: PayViaQrInput) {
  // const isPinValid = await verifyTransactionPin(input.payerId, input.pin);
  // if (!isPinValid) {
  //   throw ApiError.unauthorized('Incorrect transaction PIN');
  // }
  // const { qr, owner } = await resolveQrCode(input.code);
  // if (owner.id === input.payerId) {
  //   throw ApiError.badRequest('You cannot pay your own QR code');
  // }
  // let amount: number;
  // if (qr.type === 'dynamic') {
  //   if (qr.amount === null) throw ApiError.internal('Dynamic QR is missing an amount');
  //   if (input.amount !== undefined && input.amount !== qr.amount) {
  //     throw ApiError.badRequest('Amount does not match this QR code');
  //   }
  //   amount = qr.amount;
  // } else {
  //   if (!input.amount) throw ApiError.badRequest('Amount is required for this QR code');
  //   amount = input.amount;
  // }
  // const payerWallet = await getWalletByUserId(input.payerId);
  // const receiverWallet = await getWalletByUserId(owner.id);
  // const reference = `qr_${Date.now()}_${randomUUID().slice(0, 8)}`;
  // return AppDataSource.transaction(async (manager) => {
  //   await debitWallet(payerWallet.id, amount, manager);
  //   await creditWallet(receiverWallet.id, amount, manager);
  //   const transaction = await manager.getRepository(Transaction).save({
  //     reference,
  //     type: 'qr_payment',
  //     senderWalletId: payerWallet.id,
  //     receiverWalletId: receiverWallet.id,
  //     senderUserId: input.payerId,
  //     receiverUserId: owner.id,
  //     amount,
  //     currency: qr.currency,
  //     status: 'success',
  //     qrCodeId: qr.id,
  //     narration: qr.narration,
  //   });
  //   if (qr.type === 'dynamic') {
  //     await manager.getRepository(QrCode).update(
  //       { id: qr.id },
  //       { status: 'used', usedAt: new Date(), usedByTransactionId: transaction.id },
  //     );
  //   }
  // return "transaction";
  //});
}

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
