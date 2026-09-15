import { z } from 'zod';

export const createStaticQrSchema = z.object({
  body: z.object({
    narration: z.string().max(140).optional(),
  }),
});

export const createDynamicQrSchema = z.object({
  body: z.object({
    amount: z.number().positive().max(10_000_000),
    narration: z.string().max(140).optional(),
    ttlSeconds: z.number().int().positive().max(3600).optional(),
  }),
});

export const resolveQrSchema = z.object({
  body: z.object({
    code: z.string().min(6),
  }),
});
