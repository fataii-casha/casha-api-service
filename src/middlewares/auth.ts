import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api-error';
import { verifyAccessToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role?: 'consumer' | 'merchant'; stage: 'onboarding' | 'full' };
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
    req.user = { id: payload.sub, role: payload.role, stage: payload.stage };
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}

/** Blocks wallet/QR/transaction routes until onboarding is fully complete. */
export function requireFullAccess(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.stage !== 'full') {
    return next(ApiError.forbidden('Complete onboarding before accessing this resource'));
  }
  next();
}

export function requireRole(...roles: Array<'consumer' | 'merchant'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have access to this resource'));
    }
    next();
  };
}
