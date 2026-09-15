import { randomUUID } from 'crypto';
import QRCodeLib from 'qrcode';
import { AppDataSource } from '../../config/data-source';
import { QrCode } from './qr.entity';
import { ApiError } from '../../utils/api-error';
import { env } from '../../config/env';
import { User } from '../user/user.entity';

const QR_PAYLOAD_PREFIX = 'casha:pay';

const qrRepo = () => AppDataSource.getRepository(QrCode);
const userRepo = () => AppDataSource.getRepository(User);

function generateCode(): string {
  return randomUUID().replace(/-/g, '').slice(0, 20);
}

async function toQrImageDataUrl(code: string): Promise<string> {
  const payload = `${QR_PAYLOAD_PREFIX}:${code}`;
  return QRCodeLib.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
}

interface CreateStaticInput {
  ownerId: string;
  narration?: string;
}

export async function createStaticQr(input: CreateStaticInput) {
  const owner = await userRepo().findOne({ where: { id: input.ownerId } });
  if (!owner) throw ApiError.notFound('Owner not found');

  const existing = await qrRepo().findOne({
    where: { ownerId: owner.id, type: 'static', status: 'active' },
  });

  const qr =
    existing ??
    (await qrRepo().save({
      code: generateCode(),
      ownerId: owner.id,
      type: 'static',
      amount: null,
      currency: 'NGN',
      narration: input.narration,
    }));

  const imageDataUrl = await toQrImageDataUrl(qr.code);
  return { qr, imageDataUrl };
}

interface CreateDynamicInput {
  ownerId: string;
  amount: number;
  narration?: string;
  ttlSeconds?: number;
}

export async function createDynamicQr(input: CreateDynamicInput) {
  const owner = await userRepo().findOne({ where: { id: input.ownerId } });
  if (!owner) throw ApiError.notFound('Owner not found');

  const ttl = input.ttlSeconds ?? env.qrDynamicDefaultTtlSeconds;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const qr = await qrRepo().save({
    code: generateCode(),
    ownerId: owner.id,
    type: 'dynamic',
    amount: input.amount,
    currency: 'NGN',
    narration: input.narration,
    expiresAt,
  });

  const imageDataUrl = await toQrImageDataUrl(qr.code);
  return { qr, imageDataUrl };
}

export interface ResolvedQr {
  qr: QrCode;
  owner: { id: string; name: string; role: string };
}

// export async function resolveQrCode(code: string): Promise<ResolvedQr> {
//   let qr = await qrRepo().findOne({ where: { code } });
//   if (!qr) throw ApiError.notFound('QR code not recognized');

//   if (qr.status !== 'active') {
//     throw ApiError.badRequest(`This QR code is ${qr.status} and can no longer be used`);
//   }

//   if (qr.type === 'dynamic' && qr.expiresAt && qr.expiresAt.getTime() < Date.now()) {
//     qr.status = 'expired';
//     qr = await qrRepo().save(qr);
//     throw ApiError.badRequest('This QR code has expired');
//   }

//   const owner = await userRepo().findOne({ where: { id: qr.ownerId } });
//   if (!owner) throw ApiError.notFound('QR code owner no longer exists');

//   return {
//     qr,
//     owner: {
//       id: owner.id,
//       name: owner.role === 'merchant' ? (owner.businessName ?? owner.fullName) : owner.fullName,
//       role: owner.role,
//     },
//   };
