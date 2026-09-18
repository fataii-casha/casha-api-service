import { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as authService from './auth.service';
import { SECURITY_QUESTIONS } from './security-questions';

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

export async function setPin(req: Request, res: Response) {
  const result = await authService.setPinAndSecurityQuestion({
    userId: req.user!.id,
    pin: req.body.pin,
    securityQuestionId: req.body.securityQuestionId,
    securityAnswer: req.body.securityAnswer,
  });
  return sendSuccess(res, result, 'PIN and security question set');
}

export async function listSecurityQuestions(_req: Request, res: Response) {
  return sendSuccess(res, SECURITY_QUESTIONS, 'Security questions fetched');
}
