import bcrypt from 'bcryptjs';
import { redis } from '../../config/redis';
import { ApiError } from '../../utils/api-error';

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const OTP_SALT_ROUNDS = 10;
const MAX_VERIFY_ATTEMPTS = 5;

interface OtpRecord {
  otpHash: string;
  attempts: number;
}

function otpKey(phone: string): string {
  return `otp:phone:${phone}`;
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
}

/** Generates, hashes, and stores an OTP for the phone with a TTL. Returns the plaintext OTP to send via SMS. */
export async function issueOtp(phone: string): Promise<string> {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, OTP_SALT_ROUNDS);

  const record: OtpRecord = { otpHash, attempts: 0 };
  await redis.set(otpKey(phone), JSON.stringify(record), 'EX', OTP_TTL_SECONDS);

  return otp;
}

/** Verifies an OTP. Throws on mismatch, expiry, or too many attempts. Deletes the record on success. */
export async function verifyOtp(phone: string, otp: string): Promise<void> {
  const key = otpKey(phone);
  const raw = await redis.get(key);

  if (!raw) {
    throw ApiError.badRequest('OTP has expired or was never requested — request a new one');
  }

  const record: OtpRecord = JSON.parse(raw);

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await redis.del(key);
    throw ApiError.badRequest('Too many incorrect attempts — request a new OTP');
  }

  const isMatch = await bcrypt.compare(otp, record.otpHash);
  if (!isMatch) {
    record.attempts += 1;
    // Preserve remaining TTL instead of resetting the clock on a failed attempt.
    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(record), 'EX', ttl > 0 ? ttl : OTP_TTL_SECONDS);
    throw ApiError.badRequest('Incorrect OTP');
  }

  await redis.del(key);
}

/** Marks a phone as having completed OTP verification, so registration can check it. Short TTL — just enough to bridge to signup. */
export async function markPhoneVerified(phone: string): Promise<void> {
  await redis.set(`otp:verified:${phone}`, '1', 'EX', 30 * 60); // 30 min to complete signup
}

export async function isPhoneVerified(phone: string): Promise<boolean> {
  const value = await redis.get(`otp:verified:${phone}`);
  return value === '1';
}

export async function clearPhoneVerified(phone: string): Promise<void> {
  await redis.del(`otp:verified:${phone}`);
}
