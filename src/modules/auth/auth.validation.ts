import { z } from 'zod';

export const initiatePhoneSchema = z.object({
  body: z.object({
    phone: z.string().min(10).max(14),
  }),
});

export const verifyPhoneOtpSchema = z.object({
  body: z.object({
    phone: z.string().min(10).max(14),
    otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
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
  body: z.object({
    pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  }),
});
