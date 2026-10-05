import { z } from 'zod';
import { SECURITY_QUESTION_IDS } from './security-questions';
import { UserRole } from '../user/user.entity';

export const initiatePhoneSchema = z.object({
  body: z.object({
    phone: z.string().min(10).max(14),
  }),
});

export const verifyPhoneOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(10).max(14),
    otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
    // Only used when this phone creates a brand-new account; ignored for an
    // existing user, who keeps whatever role they already have.
    accountType: z.nativeEnum(UserRole).optional().default(UserRole.CONSUMER),
  }),
});

const MIN_AGE_YEARS = 18;

export const setPersonalDetailsSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(60),
    lastName: z.string().min(2).max(60),
    otherName: z.string().max(60).optional(),
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be in YYYY-MM-DD format')
      .refine((value) => {
        const dob = new Date(value);
        const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        return age >= MIN_AGE_YEARS;
      }, `You must be at least ${MIN_AGE_YEARS} to use Casha`),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    emailOrPhone: z.string().min(3),
    password: z.string().min(1),
  }),
});

export const setPinSchema = z.object({
  body: z
    .object({
      pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
      confirmPin: z.string().regex(/^\d{4}$/, 'Confirm PIN must be exactly 4 digits'),
      securityQuestionId: z.enum(SECURITY_QUESTION_IDS),
      securityAnswer: z.string().trim().min(2).max(100),
    })
    .refine((data) => data.pin === data.confirmPin, {
      message: 'PIN and confirm PIN do not match',
      path: ['confirmPin'],
    })
    .refine((data) => !/^(\d)\1{3}$/.test(data.pin), {
      message: 'PIN cannot be 4 repeated digits (e.g. 1111)',
      path: ['pin'],
    })
    .refine((data) => !['1234', '4321', '0000'].includes(data.pin), {
      message: 'Choose a less predictable PIN',
      path: ['pin'],
    }),
});

const pinDigits = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits');

const WEAK_PINS = ['0000', '1234', '4321'];
function isWeakPin(pin: string): boolean {
  return /^(\d)\1{3}$/.test(pin) || WEAK_PINS.includes(pin);
}

export const changePinSchema = z.object({
  body: z
    .object({
      currentPin: pinDigits,
      newPin: pinDigits,
      confirmNewPin: pinDigits,
    })
    .refine((data) => data.newPin === data.confirmNewPin, {
      message: 'New PIN and confirm PIN do not match',
      path: ['confirmNewPin'],
    })
    .refine((data) => data.newPin !== data.currentPin, {
      message: 'New PIN must be different from your current PIN',
      path: ['newPin'],
    })
    .refine((data) => !isWeakPin(data.newPin), {
      message: 'Choose a less predictable PIN',
      path: ['newPin'],
    }),
});
