import { OnboardingStep } from '../user/user.entity';

/**
 * The enforced order. EMAIL_VERIFICATION exists on the enum but isn't wired into
 * any route yet — deliberately left out of this sequence until that step is built.
 * When it's added, insert it wherever it belongs and everything downstream (the
 * guard + nextStep hints) picks it up automatically.
 */
export const ONBOARDING_ORDER: OnboardingStep[] = [
  OnboardingStep.PHONE_VERIFICATION,
  OnboardingStep.PROFILE,
  OnboardingStep.KYC,
  OnboardingStep.WALLET,
  OnboardingStep.PIN,
  OnboardingStep.COMPLETED,
];

export function getNextStep(currentStep: OnboardingStep): OnboardingStep | null {
  const index = ONBOARDING_ORDER.indexOf(currentStep);
  if (index === -1 || index === ONBOARDING_ORDER.length - 1) return null;
  return ONBOARDING_ORDER[index + 1];
}

/** Human-readable hint for API responses / error messages — what endpoint to call next. */
export const STEP_ROUTE_HINTS: Record<OnboardingStep, string | null> = {
  [OnboardingStep.PHONE_VERIFICATION]: 'PATCH /auth/onboarding/personal-details',
  [OnboardingStep.PROFILE]: 'POST /kyc/bvn/verify',
  [OnboardingStep.KYC]: 'POST /wallets',
  [OnboardingStep.WALLET]: 'POST /auth/pin',
  [OnboardingStep.PIN]: 'Completed',
  [OnboardingStep.COMPLETED]: null,
};
