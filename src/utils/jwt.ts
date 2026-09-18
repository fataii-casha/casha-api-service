import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { OnboardingStep, UserRole } from '../modules/user/user.entity';

export interface AccessTokenPayload {
  sub: string;
  role?: UserRole;
  onboardingStep: OnboardingStep;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = { expiresIn: env.jwtAccessExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwtAccessSecret, options);
}

export function signRefreshToken(payload: { sub: string }): string {
  const options: SignOptions = { expiresIn: env.jwtRefreshExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwtRefreshSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { sub: string };
}
