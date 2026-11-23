import { redis } from '../config/redis';

// INCR and start the TTL in one atomic step, so a crash between the two can never leave a
// counter without an expiry (which would mean a permanent lockout).
const INCREMENT_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count`;

/** Increments `key`; the first increment starts a `ttlSeconds` window. Returns the new count. */
export async function incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
  return Number(await redis.eval(INCREMENT_WITH_TTL, 1, key, ttlSeconds));
}

/** Whole minutes (at least 1) until `key` expires — for "try again in N minutes" messages. */
export async function minutesUntilExpiry(key: string): Promise<number> {
  return Math.max(1, Math.ceil((await redis.ttl(key)) / 60));
}
