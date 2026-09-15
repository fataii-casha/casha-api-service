import { z } from 'zod';

export const payViaQrSchema = z.object({
  body: z.object({
    code: z.string().min(6),
    // Required when paying a static (merchant) QR since it has no fixed amount.
    // If the QR is dynamic, this must match the QR's amount exactly if provided.
    amount: z.number().positive().max(10_000_000).optional(),
    pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  }),
});

export const listTransactionsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});
