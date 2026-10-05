import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as merchantService from './merchant.service';
import { BusinessDocumentType } from './business-document.entity';

export async function setBusinessInfo(req: Request, res: Response) {
  const result = await merchantService.setBusinessInfo({ userId: req.user!.id, ...req.body });
  return sendSuccess(res, result, 'Business info saved');
}

export async function uploadDocuments(req: Request, res: Response) {
  const files = req.files as Partial<Record<BusinessDocumentType, Express.Multer.File[]>>;
  const result = await merchantService.uploadBusinessDocuments({
    userId: req.user!.id,
    rcNumber: req.body.rcNumber,
    files: files ?? {},
  });
  return sendSuccess(res, result, 'Business documents saved');
}

export async function setBusinessAddress(req: Request, res: Response) {
  const result = await merchantService.setBusinessAddress({ userId: req.user!.id, ...req.body });
  return sendSuccess(res, result, 'Business address saved');
}

export async function uploadLogo(req: Request, res: Response) {
  const result = await merchantService.uploadBusinessLogo(req.user!.id, req.file);
  return sendSuccess(res, result, 'Business logo uploaded');
}

export async function setOwnerDetails(req: Request, res: Response) {
  const result = await merchantService.setOwnerDetails({ userId: req.user!.id, ...req.body });
  return sendSuccess(res, result, 'Owner details saved');
}

export async function getMyBusiness(req: Request, res: Response) {
  const business = await merchantService.getMyBusiness(req.user!.id);
  return sendSuccess(res, business, 'Business fetched');
}
