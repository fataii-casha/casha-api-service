import { z } from 'zod';

export const mockFundSchema = z.object({
  body: z.object({
    amount: z.number().int().positive().max(10_000_000),
  }),
});
