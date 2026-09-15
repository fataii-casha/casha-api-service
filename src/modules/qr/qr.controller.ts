import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as qrService from './qr.service';

export async function createStatic(req: Request, res: Response) {
  const result = await qrService.createStaticQr({
    ownerId: req.user!.id,
    narration: req.body.narration,
  });
  return sendSuccess(res, result, 'Static QR code ready', 201);
}

export async function createDynamic(req: Request, res: Response) {
  const result = await qrService.createDynamicQr({
    ownerId: req.user!.id,
    amount: req.body.amount,
    narration: req.body.narration,
    ttlSeconds: req.body.ttlSeconds,
  });
  return sendSuccess(res, result, 'Dynamic QR code ready', 201);
}
