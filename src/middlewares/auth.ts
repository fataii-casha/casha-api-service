import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api-error';
import { verifyAccessToken } from '../utils/jwt';
import { UserRole, OnboardingStep } from '../modules/user/user.entity';
import { STEP_ROUTE_HINTS } from '../modules/auth/onboarding';

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

/** Blocks wallet/QR/transaction routes until onboarding is fully complete. */
export function requireFullAccess(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.onboardingStep !== OnboardingStep.COMPLETED) {
    return next(ApiError.forbidden('Complete onboarding before accessing this resource'));
  }
  next();
}

/**
 * Enforces that the token's current onboardingStep exactly matches what this
 * endpoint expects — prevents skipping ahead (e.g. setting a PIN before BVN is
 * verified) or calling a step twice out of order.
 */
export function requireOnboardingStep(expectedStep: OnboardingStep) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const currentStep = req.user?.onboardingStep;

    if (currentStep === undefined) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (currentStep !== expectedStep) {
      const hint = STEP_ROUTE_HINTS[currentStep];
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
