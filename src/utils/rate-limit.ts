import { ApiError } from './api-error';
import { incrementWithTtl, minutesUntilExpiry } from './redis-counter';

/**
 * Per-key fixed-window limit backed by Redis (shared across app instances). Throws 429 once
 * `limit` calls have been made in the current `windowSeconds` window.
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message: string,
): Promise<void> {
  const count = await incrementWithTtl(`rl:${key}`, windowSeconds);
  if (count > limit) {
    const minutes = await minutesUntilExpiry(`rl:${key}`);
    throw ApiError.tooManyRequests(
      `${message} Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }
}
