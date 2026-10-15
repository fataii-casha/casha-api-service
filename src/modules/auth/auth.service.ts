import { AppDataSource } from '../../config/data-source';
import { OnboardingStep, User, UserRole } from '../user/user.entity';
import { normalizeNigerianPhone } from '../../utils/phone';
import { issueOtp, verifyOtp } from './otp.service';
import { ApiError } from '../../utils/api-error';
import { buildSessionResponse } from '../user/account-response';
import { verifyRefreshToken } from '../../utils/jwt';
import { SetPersonalDetailsInput, SetPinInput } from './interfaces/auth.types';
import bcrypt from 'bcryptjs';

const userRepo = () => AppDataSource.getRepository(User);

const PIN_SALT_ROUNDS = 12;
const SECURITY_ANSWER_SALT_ROUNDS = 12;

import { assertPinNotLocked, clearPinAttempts, registerFailedPinAttempt } from './pin-attempts';

export async function initiatePhoneVerification(phone: string) {
  const normalizedPhone = normalizeNigerianPhone(phone);

  const existing = await userRepo().findOne({
    where: {
      phone: normalizedPhone,
      isPhoneVerified: true,
    },
  });

  const otp = await issueOtp(normalizedPhone);

  await sendOtpSms(normalizedPhone, otp);

  if (existing) {
    return {
      phone: normalizedPhone,
      purpose: 'login',
      message: 'OTP sent. Use the OTP to login.',
    };
  }

  return {
    phone: normalizedPhone,
    purpose: 'verification',
    message: 'OTP sent. Use the OTP to verify your phone number.',
  };
}

/** Verifies the OTP and creates the account skeleton (phone only). Returns an onboarding-scoped token. */
export async function verifyPhoneOtp(phone: string, otp: string, accountType: UserRole) {
  const normalizedPhone = normalizeNigerianPhone(phone);

  await verifyOtp(normalizedPhone, otp);

  const existing = await userRepo().findOne({ where: { phone: normalizedPhone } });

  if (existing) {
    if (!existing.isActive) {
      throw ApiError.forbidden('This account has been deactivated. Contact support.');
    }
    return { ...(await buildSessionResponse(existing)), created: false };
  }

  const user = await userRepo().save({
    phone: normalizedPhone,
    isPhoneVerified: true,
    role: accountType,
    onboardingStep: OnboardingStep.PHONE_VERIFICATION,
  });

  return { ...(await buildSessionResponse(user)), created: true };
}

/** Swaps a valid refresh token for a fresh token pair, carrying the user's current onboarding step. */
export async function refreshSession(refreshToken: string) {
  let userId: string;
  try {
    userId = verifyRefreshToken(refreshToken).sub;
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated. Contact support.');
  }

  return buildSessionResponse(user);
}

/** Second onboarding step — requires an onboarding-scoped token from phone verification. */
export async function setPersonalDetails(input: SetPersonalDetailsInput) {
  const user = await userRepo().findOne({ where: { id: input.userId } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.firstName = input.firstName;
  user.lastName = input.lastName;
  user.otherName = input.otherName;
  user.dob = input.dob;
  user.onboardingStep = OnboardingStep.PROFILE;

  await userRepo().save(user);

  return buildSessionResponse(user);
}

/** Final onboarding step — sets the transaction PIN + security question, then marks onboarding complete. */
export async function setPinAndSecurityQuestion(input: SetPinInput) {
  const user = await userRepo().findOne({ where: { id: input.userId } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const [pinHash, securityAnswerHash] = await Promise.all([
    bcrypt.hash(input.pin, PIN_SALT_ROUNDS),
    // Normalize the answer (trim + lowercase) before hashing so verification isn't
    // sensitive to casing or stray whitespace the user might type differently later.
    bcrypt.hash(input.securityAnswer.trim().toLowerCase(), SECURITY_ANSWER_SALT_ROUNDS),
  ]);

  user.transactionPinHash = pinHash;
  user.securityQuestionId = input.securityQuestionId;
  user.securityAnswerHash = securityAnswerHash;
  user.onboardingStep = OnboardingStep.COMPLETED;

  await userRepo().save(user);

  return buildSessionResponse(user);
}

export async function verifyTransactionPin(userId: string, pin: string): Promise<boolean> {
  await assertPinNotLocked(userId);

  const user = await userRepo()
    .createQueryBuilder('user')
    .addSelect('user.transactionPinHash')
    .where('user.id = :userId', { userId })
    .getOne();

  if (!user?.transactionPinHash) {
    throw ApiError.badRequest('Transaction PIN not set. Please set a PIN first.');
  }

  const isMatch = await bcrypt.compare(pin, user.transactionPinHash);

  if (isMatch) {
    await clearPinAttempts(userId);
  } else {
    await registerFailedPinAttempt(userId);
  }

  return isMatch;
}

interface ChangePinInput {
  userId: string;
  currentPin: string;
  newPin: string;
}

export async function changeTransactionPin(input: ChangePinInput) {
  const isCurrentPinValid = await verifyTransactionPin(input.userId, input.currentPin);
  if (!isCurrentPinValid) {
    throw ApiError.unauthorized('Current PIN is incorrect');
  }

  const newPinHash = await bcrypt.hash(input.newPin, PIN_SALT_ROUNDS);
  await userRepo().update({ id: input.userId }, { transactionPinHash: newPinHash });

  return { message: 'Transaction PIN changed successfully' };
}

async function sendOtpSms(phone: string, otp: string): Promise<void> {
  // Stub — replace with your SMS provider call (Termii/Africa's Talking/etc.)
  // eslint-disable-next-line no-console
  console.log(`[DEV] OTP for ${phone}: ${otp}`);
}
