import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as authService from './auth.service';

export async function initiatePhone(req: Request, res: Response) {
  const result = await authService.initiatePhoneVerification(req.body.phone);
  return sendSuccess(res, result, 'OTP sent to phone number');
}

export async function verifyPhone(req: Request, res: Response) {
  const result = await authService.verifyPhoneOtp(req.body.phone, req.body.otp);
  return sendSuccess(res, result, 'Phone verified, continue onboarding', 201);
}

export async function setPersonalDetails(req: Request, res: Response) {
  const result = await authService.setPersonalDetails({
    userId: req.user!.id,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    otherName: req.body.otherName,
    dob: req.body.dob,
  });
  return sendSuccess(res, result, 'Personal details saved');
}
