import { z } from 'zod';

export const mockFundSchema = z.object({
  body: z.object({
    amount: z.number().int().positive().max(10_000_000),
  }),
});

const walletName = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(30, 'Name must be at most 30 characters');
const walletColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code like #4F46E5')
  .transform((color) => color.toUpperCase());
// A key from the app's icon set, e.g. "piggy-bank". The app owns the list.
const walletIcon = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,49}$/, 'Icon must be a lowercase key like "piggy-bank"');

const walletIdParams = z.object({ walletId: z.string().uuid() });

export const createStashSchema = z.object({
  body: z.object({
    name: walletName,
    color: walletColor.optional(),
    icon: walletIcon.optional(),
  }),
});

export const updateWalletSchema = z.object({
  params: walletIdParams,
  body: z
    .object({
      name: walletName.optional(),
      color: walletColor.nullable().optional(), // null resets to the app default
      icon: walletIcon.nullable().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, 'Send at least one of name, color, icon'),
});

export const walletIdSchema = z.object({
  params: walletIdParams,
});

export const walletTransferSchema = z.object({
  body: z
    .object({
      fromWalletId: z.string().uuid(),
      toWalletId: z.string().uuid(),
      amount: z.number().int().positive().max(1_000_000_000), // kobo, ₦10M per move
      narration: z.string().trim().max(100).optional(),
      // Send the same key when retrying, so a retry never moves the money twice.
      idempotencyKey: z
        .string()
        .regex(/^[A-Za-z0-9_-]{8,64}$/)
        .optional(),
    })
    .refine((body) => body.fromWalletId !== body.toWalletId, {
      message: 'Choose two different wallets',
      path: ['toWalletId'],
    }),
});
