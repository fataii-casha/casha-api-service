import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api-error';
import { verifyAccessToken } from '../utils/jwt';
import { UserRole, OnboardingStep } from '../modules/user/user.entity';
import { getStepRouteHint } from '../modules/auth/onboarding';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role?: UserRole; onboardingStep: OnboardingStep };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing or malformed authorization header'));
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, onboardingStep: payload.onboardingStep };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}

export function requireFullAccess(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.onboardingStep !== OnboardingStep.COMPLETED) {
    return next(ApiError.forbidden('Complete onboarding before accessing this resource'));
  }
  next();
}

/**
 * Enforces that the token's current onboardingStep matches what this endpoint expects.
 * Accepts either one step (most endpoints) or a list (endpoints reachable from more
 * than one prior step — e.g. BVN verification follows PROFILE for consumers but
 * OWNER_DETAILS for merchants).
 */
export function requireOnboardingStep(expected: OnboardingStep | OnboardingStep[]) {
  const allowed = Array.isArray(expected) ? expected : [expected];

  return (req: Request, _res: Response, next: NextFunction) => {
    const currentStep = req.user?.onboardingStep;

    if (currentStep === undefined) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!allowed.includes(currentStep)) {
      const hint = getStepRouteHint(currentStep, req.user?.role);
      return next(
        ApiError.forbidden(
          hint
            ? `You're currently at the "${currentStep}" step. Next: ${hint}`
            : `Unexpected onboarding state: "${currentStep}"`,
        ),
      );
    }

    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have access to this resource'));
    }
    next();
  };
}
