import { OnboardingStep, UserRole } from '../user/user.entity';

const CONSUMER_ORDER: OnboardingStep[] = [
  OnboardingStep.PHONE_VERIFICATION,
  OnboardingStep.PROFILE,
  OnboardingStep.KYC,
  OnboardingStep.WALLET,
  OnboardingStep.PIN,
  OnboardingStep.COMPLETED,
];

const MERCHANT_ORDER: OnboardingStep[] = [
  OnboardingStep.PHONE_VERIFICATION,
  OnboardingStep.BUSINESS_INFO,
  OnboardingStep.BUSINESS_DOCUMENTS,
  OnboardingStep.BUSINESS_ADDRESS,
  OnboardingStep.BUSINESS_LOGO,
  OnboardingStep.OWNER_DETAILS,
  OnboardingStep.KYC,
  OnboardingStep.COMPLETED,
];

function getOrderForRole(role?: UserRole): OnboardingStep[] {
  return role === UserRole.MERCHANT ? MERCHANT_ORDER : CONSUMER_ORDER;
}

export function getNextStep(currentStep: OnboardingStep, role?: UserRole): OnboardingStep | null {
  const order = getOrderForRole(role);
  const index = order.indexOf(currentStep);
  if (index === -1 || index === order.length - 1) return null;
  return order[index + 1];
}

export function getStepRouteHint(step: OnboardingStep, role?: UserRole): string | null {
  const isMerchant = role === UserRole.MERCHANT;

  const hints: Record<OnboardingStep, string | null> = {
    [OnboardingStep.PHONE_VERIFICATION]: isMerchant
      ? 'PATCH /merchants/business-info'
      : 'PATCH /auth/onboarding/personal-details',
    // [OnboardingStep.EMAIL_VERIFICATION]: 'Not yet available',
    [OnboardingStep.PROFILE]: 'POST /kyc/bvn/verify',
    [OnboardingStep.BUSINESS_INFO]: 'POST /merchants/documents',
    [OnboardingStep.BUSINESS_DOCUMENTS]: 'PATCH /merchants/address',
    [OnboardingStep.BUSINESS_ADDRESS]: 'POST /merchants/logo',
    [OnboardingStep.BUSINESS_LOGO]: 'PATCH /merchants/owner-details',
    [OnboardingStep.OWNER_DETAILS]: 'POST /kyc/bvn/verify',
    [OnboardingStep.KYC]: 'POST /wallets, then POST /auth/pin',
    [OnboardingStep.WALLET]: 'POST /auth/pin',
    [OnboardingStep.PIN]: 'Completed',
    [OnboardingStep.COMPLETED]: null,
  };

  return hints[step];
}
