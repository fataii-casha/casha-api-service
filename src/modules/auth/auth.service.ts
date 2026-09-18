import { AppDataSource } from '../../config/data-source';
import { OnboardingStep, User, UserRole } from '../user/user.entity';
import { normalizeNigerianPhone } from '../../utils/phone';
import { issueOtp, verifyOtp } from './otp.service';
import { ApiError } from '../../utils/api-error';
import { signAccessToken, signRefreshToken } from '../../utils/jwt';
import { SetPersonalDetailsInput, SetPinInput } from './interfaces/auth.types';
import bcrypt from 'bcryptjs';

const userRepo = () => AppDataSource.getRepository(User);

const PIN_SALT_ROUNDS = 12;
const SECURITY_ANSWER_SALT_ROUNDS = 12;

import { getNextStep } from './onboarding';

function toAuthResponse(user: User) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    onboardingStep: user.onboardingStep,
  });
  const refreshToken = signRefreshToken({ sub: user.id });

  return {
    user: {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      otherName: user.otherName,
      dob: user.dob,
      email: user.email,
      role: user.role,
      businessName: user.businessName,
      bvnVerified: user.bvnVerified,
      kycTier: user.kycTier,
      onboardingStep: user.onboardingStep,
      nextStep: getNextStep(user.onboardingStep),
    },
    accessToken,
    refreshToken,
  };
}

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
      code: otp,
      purpose: 'login',
      message: 'OTP sent. Use the OTP to login.',
    };
  }

  return {
    phone: normalizedPhone,
    code: otp,
    purpose: 'verification',
    message: 'OTP sent. Use the OTP to verify your phone number.',
  };
}

/** Verifies the OTP and creates the account skeleton (phone only). Returns an onboarding-scoped token. */
export async function verifyPhoneOtp(phone: string, otp: string) {
  const normalizedPhone = normalizeNigerianPhone(phone);

  await verifyOtp(normalizedPhone, otp);

  const existing = await userRepo().findOne({
    where: {
      phone: normalizedPhone,
    },
  });

  // Existing user → login
  if (existing) {
    return toAuthResponse(existing);
  }

  // New user → create account and continue onboarding
  const user = await AppDataSource.transaction(async (manager) => {
    const created = await manager.getRepository(User).save({
      firstName: '',
      lastName: '',
      isEmailVerified: false,
      phone: normalizedPhone,
      isPhoneVerified: true,
      role: UserRole.CONSUMER,
      onboardingStage: OnboardingStep.PHONE_VERIFICATION,
    });

    return created;
  });

  return toAuthResponse(user);
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

  return toAuthResponse(user);
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
  user.onboardingStep = OnboardingStep.PIN;

  await userRepo().save(user);

  return {
    message: 'PIN and security question set. Onboarding complete.',
    onboardingStep: user.onboardingStep,
    nextStep: getNextStep(user.onboardingStep), // will be null — onboarding is done
  };
}

export async function verifyTransactionPin(userId: string, pin: string): Promise<boolean> {
  const user = await userRepo()
    .createQueryBuilder('user')
    .addSelect('user.transactionPinHash')
    .where('user.id = :userId', { userId })
    .getOne();

  if (!user?.transactionPinHash) {
    throw ApiError.badRequest('Transaction PIN not set. Please set a PIN first.');
  }
  return bcrypt.compare(pin, user.transactionPinHash);
}

async function sendOtpSms(phone: string, otp: string): Promise<void> {
  // Stub — replace with your SMS provider call (Termii/Africa's Talking/etc.)
  // eslint-disable-next-line no-console
  console.log(`[DEV] OTP for ${phone}: ${otp}`);
}
