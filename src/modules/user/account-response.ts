import { AppDataSource } from '../../config/data-source';
import { OnboardingStep, User, UserRole } from './user.entity';
import { Wallet } from '../wallet/wallet.entity';
import { Business } from '../merchants/business.entity';
import { BusinessDocument } from '../merchants/business-document.entity';
import { getNextStep, getStepRouteHint } from '../auth/onboarding';
import { signAccessToken, signRefreshToken } from '../../utils/jwt';

const walletRepo = () => AppDataSource.getRepository(Wallet);
const businessRepo = () => AppDataSource.getRepository(Business);
const documentRepo = () => AppDataSource.getRepository(BusinessDocument);

function buildDisplayName(user: User): string {
  if (user.role === UserRole.MERCHANT && user.businessName) {
    return user.businessName;
  }
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Casha user';
}

function toUserView(user: User, hasWallet: boolean) {
  // passwordHash, transactionPinHash and securityAnswerHash are select:false on the
  // entity, so they never reach this point.
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
    isActive: user.isActive,
    isPoliticallyExposed: user.isPoliticallyExposed ?? null,
    hasWallet,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function loadBusinessView(user: User) {
  if (user.role !== UserRole.MERCHANT) return null;

  const business = await businessRepo().findOne({ where: { ownerId: user.id } });
  if (!business) return null; // until the business-info step is completed

  const documents = await documentRepo().find({ where: { businessId: business.id } });

  return {
    id: business.id,
    businessName: business.businessName,
    industry: business.industry,
    isRegistered: business.isRegistered,
    rcNumber: business.rcNumber ?? null,
    addressLine1: business.addressLine1 ?? null,
    addressLine2: business.addressLine2 ?? null,
    city: business.city ?? null,
    state: business.state ?? null,
    country: business.country,
    logoUrl: business.logoUrl ?? null,
    verificationStatus: business.verificationStatus,
    documents: documents.map((doc) => ({
      documentType: doc.documentType,
      fileUrl: doc.fileUrl,
    })),
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
  };
}

function toOnboardingView(user: User) {
  return {
    currentStep: user.onboardingStep,
    nextStep: getNextStep(user.onboardingStep, user.role),
    nextAction: getStepRouteHint(user.onboardingStep, user.role),
    isCompleted: user.onboardingStep === OnboardingStep.COMPLETED,
  };
}

/**
 * The single account shape every consumer and merchant profile/onboarding endpoint
 * returns: { user, business, onboarding }. business is always null for consumers.
 */
export async function buildAccountResponse(user: User) {
  const [hasWallet, business] = await Promise.all([
    walletRepo()
      .count({ where: { userId: user.id } })
      .then((count) => count > 0),
    loadBusinessView(user),
  ]);

  return {
    user: toUserView(user, hasWallet),
    business,
    onboarding: toOnboardingView(user),
  };
}

/**
 * Account shape plus a fresh token pair. Used by every endpoint that changes the
 * onboarding step, because requireOnboardingStep reads the step from the token —
 * the client must swap in the new accessToken to call the next step.
 */
export async function buildSessionResponse(user: User) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    onboardingStep: user.onboardingStep,
  });
  const refreshToken = signRefreshToken({ sub: user.id });

  return {
    ...(await buildAccountResponse(user)),
    accessToken,
    refreshToken,
  };
}
