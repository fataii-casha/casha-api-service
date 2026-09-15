import { z } from 'zod';

export const verifyBvnSchema = z.object({
  body: z.object({
    bvn: z.string().regex(/^\d{11}$/, 'BVN must be exactly 11 digits'),
  }),
});
