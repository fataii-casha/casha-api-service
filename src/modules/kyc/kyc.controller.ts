import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as kycService from './kyc.service';

export async function verifyBvn(req: Request, res: Response) {
  const result = await kycService.verifyBvn({ userId: req.user!.id, bvn: req.body.bvn });
  return sendSuccess(res, result, 'BVN verified successfully');
}
