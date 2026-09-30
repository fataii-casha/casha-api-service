import { AppDataSource } from '../../config/data-source';
import { User, UserRole } from './user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { getNextStep } from '../auth/onboarding';
import { ApiError } from '../../utils/api-error';

const userRepo = () => AppDataSource.getRepository(User);
const walletRepo = () => AppDataSource.getRepository(Wallet);

function buildDisplayName(user: User): string {
  if (user.role === UserRole.MERCHANT && user.businessName) {
    return user.businessName;
  }
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Casha user';
}

export async function getProfile(userId: string) {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // passwordHash, transactionPinHash and securityAnswerHash are select:false on the
  // entity, so they never appear here.
  const hasWallet = (await walletRepo().count({ where: { userId } })) > 0;

  return {
    id: user.id,
    displayName: buildDisplayName(user),
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    otherName: user.otherName ?? null,
    dob: user.dob ?? null,
    phone: user.phone,
    isPhoneVerified: user.isPhoneVerified,
    email: user.email ?? null,
    isEmailVerified: user.isEmailVerified,
    role: user.role ?? null,
    businessName: user.businessName ?? null,
    bvnVerified: user.bvnVerified,
    bvnLast4: user.bvnLast4 ?? null,
    kycTier: user.kycTier,
    hasWallet,
    onboardingStep: user.onboardingStep,
    nextStep: getNextStep(user.onboardingStep),
    createdAt: user.createdAt,
  };
}
