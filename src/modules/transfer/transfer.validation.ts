import { z } from 'zod';

// Control characters and invisible formatting characters (zero-width, bidi overrides) are
// stripped: they can be used to disguise a narration on the recipient's statement.
/* eslint-disable no-control-regex -- matching control characters is the point */
const INVISIBLE_CHARS =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
/* eslint-enable no-control-regex */

export const recipientLookupSchema = z.object({
  query: z
    .object({
      phone: z.string().trim().min(10).max(20).optional(),
      accountNumber: z
        .string()
        .regex(/^\d{10}$/, 'Account number must be 10 digits')
        .optional(),
    })
    .refine((q) => Boolean(q.phone) !== Boolean(q.accountNumber), {
      message: 'Send exactly one of phone or accountNumber',
    }),
});

export const sendTransferSchema = z.object({
  body: z.object({
    recipientId: z.string().uuid(),
    amount: z.number().int().positive().max(1_000_000_000_00), // kobo; tier limits apply on top
    pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
    // One per transfer attempt; reuse it when retrying so the money can't move twice.
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/, 'idempotencyKey must be 8–64 letters, digits, - or _'),
    narration: z
      .string()
      .transform((text) =>
        // Whitespace (incl. newlines/tabs) → single spaces first, so words don't run together.
        text.replace(/\s+/g, ' ').replace(INVISIBLE_CHARS, '').replace(/ {2,}/g, ' ').trim(),
      )
      .pipe(z.string().max(100, 'Narration must be at most 100 characters'))
      .optional()
      .transform((text) => text || undefined),
    fromWalletId: z.string().uuid().optional(), // main wallet by default; a stash also works
  }),
});

export const bankFeeSchema = z.object({
  query: z.object({
    amount: z.coerce.number().int().positive(),
  }),
});

export const sendBankTransferSchema = z.object({
  body: z.object({
    accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
    bankCode: z.string().regex(/^[A-Za-z0-9]{3,12}$/, 'Select a valid bank'),
    amount: z.number().int().positive().max(1_000_000_000_00),
    pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/, 'idempotencyKey must be 8–64 letters, digits, - or _'),
    narration: sendTransferSchema.shape.body.shape.narration,
    fromWalletId: z.string().uuid().optional(),
  }),
});
