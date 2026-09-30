import { redis } from '../../config/redis';
import { ApiError } from '../../utils/api-error';

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;

const attemptsKey = (userId: string) => `pin:attempts:${userId}`;

export async function assertPinNotLocked(userId: string): Promise<void> {
  const attempts = Number((await redis.get(attemptsKey(userId))) ?? 0);
  if (attempts >= MAX_PIN_ATTEMPTS) {
    const ttl = await redis.ttl(attemptsKey(userId));
    const minutes = Math.max(1, Math.ceil(ttl / 60));
    throw ApiError.tooManyRequests(
      `Too many incorrect PIN attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }
}

export async function registerFailedPinAttempt(userId: string): Promise<void> {
  const key = attemptsKey(userId);
  const attempts = await redis.incr(key);
  // Start the window on the first failure; restart it once the limit is hit so the
  // lockout runs 15 minutes from the last bad attempt.
  if (attempts === 1 || attempts >= MAX_PIN_ATTEMPTS) {
    await redis.expire(key, LOCKOUT_SECONDS);
  }
}

export async function clearPinAttempts(userId: string): Promise<void> {
  await redis.del(attemptsKey(userId));
}
