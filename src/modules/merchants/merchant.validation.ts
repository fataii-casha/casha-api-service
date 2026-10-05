import { z } from 'zod';
import { BusinessDocumentType } from './business-document.entity';

export const businessInfoSchema = z.object({
  body: z.object({
    businessName: z.string().min(2).max(150),
    industry: z.string().min(2).max(100),
    isRegistered: z.boolean(),
  }),
});

export const businessDocumentsSchema = z.object({
  body: z.object({
    rcNumber: z.string().min(4).max(20).optional(),
  }),
});

export const businessAddressSchema = z.object({
  body: z.object({
    addressLine1: z.string().min(5).max(200),
    addressLine2: z.string().max(200).optional(),
    city: z.string().min(2).max(100),
    state: z.string().min(2).max(100),
    country: z.string().min(2).max(100).optional(),
  }),
});

const MIN_AGE_YEARS = 18;

export const ownerDetailsSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(60),
    lastName: z.string().min(2).max(60),
    otherName: z.string().max(60).optional(),
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be in YYYY-MM-DD format')
      .refine((value) => {
        const age = (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        return age >= MIN_AGE_YEARS;
      }, `Owner must be at least ${MIN_AGE_YEARS}`),
    isPoliticallyExposed: z.boolean(),
  }),
});

export const DOCUMENT_FIELD_NAMES = Object.values(BusinessDocumentType);
