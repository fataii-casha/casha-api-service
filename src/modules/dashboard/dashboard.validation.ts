import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  query: z.object({
    walletId: z.string().uuid().optional(), // the active wallet; defaults to main
  }),
});
