import { randomUUID } from 'crypto';
import { redis } from '../../config/redis';
import { ApiError } from '../../utils/api-error';
import { incrementWithTtl, minutesUntilExpiry } from '../../utils/redis-counter';

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;

// Per-user mutex around PIN checks. Without it, parallel requests all pass the "locked?"
// check before any failure is counted, letting an attacker try far more than 5 PINs.
const PIN_CHECK_LOCK_MS = 5_000; // auto-release if a process dies holding it
const PIN_CHECK_WAIT_MS = 3_000; // how long a concurrent request waits its turn
const PIN_CHECK_POLL_MS = 25;

const attemptsKey = (userId: string) => `pin:attempts:${userId}`;
const checkLockKey = (userId: string) => `pin:check-lock:${userId}`;

// Delete the lock only if we still own it (it may have expired and been taken by another request).
const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

async function withPinCheckLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const key = checkLockKey(userId);
  const token = randomUUID();
  const deadline = Date.now() + PIN_CHECK_WAIT_MS;

  while ((await redis.set(key, token, 'PX', PIN_CHECK_LOCK_MS, 'NX')) !== 'OK') {
    if (Date.now() > deadline) {
      throw ApiError.tooManyRequests('Another payment is being processed. Please try again.');
    }
    await new Promise((resolve) => setTimeout(resolve, PIN_CHECK_POLL_MS));
  }

  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE_LOCK, 1, key, token);
  }
}

async function assertPinNotLocked(userId: string): Promise<void> {
  const attempts = Number((await redis.get(attemptsKey(userId))) ?? 0);
  if (attempts >= MAX_PIN_ATTEMPTS) {
    const minutes = await minutesUntilExpiry(attemptsKey(userId));
    throw ApiError.tooManyRequests(
      `Too many incorrect PIN attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }
}

/**
 * Runs `compare` (the bcrypt check) under the lockout rules, one check per user at a time:
 * throws 429 while locked, counts a failure on a mismatch (the 5th locks the PIN for 15
 * minutes from that attempt), and clears the count on success.
 */
export async function checkPinWithLockout(
  userId: string,
  compare: () => Promise<boolean>,
): Promise<boolean> {
  return withPinCheckLock(userId, async () => {
    await assertPinNotLocked(userId);

    const isMatch = await compare();
    if (isMatch) {
      await redis.del(attemptsKey(userId));
      return true;
    }

    const attempts = await incrementWithTtl(attemptsKey(userId), LOCKOUT_SECONDS);
    if (attempts >= MAX_PIN_ATTEMPTS) {
      await redis.expire(attemptsKey(userId), LOCKOUT_SECONDS);
    }
    return false;
  });
}
