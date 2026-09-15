import { AppDataSource } from '../../config/data-source';
import { OnboardingStep, User, UserRole } from '../user/user.entity';
import { normalizeNigerianPhone } from '../../utils/phone';
import { issueOtp, verifyOtp } from './otp.service';
import { ApiError } from '../../utils/api-error';
import { signAccessToken, signRefreshToken, AccessTokenPayload } from '../../utils/jwt';

const userRepo = () => AppDataSource.getRepository(User);

function toAuthResponse(user: User) {
  const tokenPayload: AccessTokenPayload = {
    sub: user.id,
    role: user.role,
    stage: user.onboardingStep === 'completed' ? 'full' : 'onboarding',
  };

  const accessToken = signAccessToken(tokenPayload);
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
      // businessName: user.businessName,
      kycTier: user.kycTier,
      onboardingStage: user.onboardingStep,
    },
    accessToken,
    refreshToken,
  };
}

export async function initiatePhoneVerification(phone: string) {
  const normalizedPhone = normalizeNigerianPhone(phone);

  const existing = await userRepo().findOne({
    where: { phone: normalizedPhone, isPhoneVerified: true },
  });

  if (existing) {
    throw ApiError.conflict('An account with this phone number already exists');
  }

  const otp = await issueOtp(normalizedPhone);
  await sendOtpSms(normalizedPhone, otp);

  return { phone: normalizedPhone, code: otp, message: 'OTP sent' };
}

/** Verifies the OTP and creates the account skeleton (phone only). Returns an onboarding-scoped token. */
export async function verifyPhoneOtp(phone: string, otp: string) {
  const normalizedPhone = normalizeNigerianPhone(phone);

  await verifyOtp(normalizedPhone, otp);

  const existing = await userRepo().findOne({ where: { phone: normalizedPhone } });
  if (existing) {
    throw ApiError.conflict('An account with this phone number already exists');
  }

  const user = await AppDataSource.transaction(async (manager) => {
    const created = await manager.getRepository(User).save({
      firstName: '',
      lastName: '',
      isEmailVerified: false,
      phone: normalizedPhone,
      isPhoneVerified: true,
      role: UserRole.CONSUMER,
      onboardingStage: 'phone_verified',
    });

    // await manager.getRepository(Wallet).save({
    //   userId: created.id,
    //   balance: 0,
    //   currency: 'NGN',
    // });

    return created;
  });

  return toAuthResponse(user);
}

interface SetPersonalDetailsInput {
  userId: string;
  firstName: string;
  lastName: string;
  otherName?: string;
  dob: string;
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

async function sendOtpSms(phone: string, otp: string): Promise<void> {
  // Stub — replace with your SMS provider call (Termii/Africa's Talking/etc.)
  // eslint-disable-next-line no-console
  console.log(`[DEV] OTP for ${phone}: ${otp}`);
}
