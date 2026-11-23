import { User, UserRole } from '../user/user.entity';

const NAIRA = 100; // kobo

export interface TransferLimits {
  /** Smallest transfer, in kobo. Stops ₦1 "ping" transfers used for spam narrations. */
  minAmount: number;
  /** Largest single transfer, in kobo. */
  singleMax: number;
  /** Total the user can send per day (Africa/Lagos calendar day), in kobo. */
  dailyMax: number;
  /** Most the account may hold across all its wallets, in kobo. null = no cap. */
  maxBalance: number | null;
}

const MIN_AMOUNT = 10 * NAIRA;

/*
 * Defaults follow the CBN tiered-KYC limits for individual wallets (tier 1 ₦50k daily /
 * ₦300k balance, tier 2 ₦200k / ₦500k, tier 3 ₦5M / no cap).
 * TODO(compliance): confirm these and the merchant limits before launch.
 */
const CONSUMER_LIMITS: Record<number, TransferLimits> = {
  1: {
    minAmount: MIN_AMOUNT,
    singleMax: 50_000 * NAIRA,
    dailyMax: 50_000 * NAIRA,
    maxBalance: 300_000 * NAIRA,
  },
  2: {
    minAmount: MIN_AMOUNT,
    singleMax: 100_000 * NAIRA,
    dailyMax: 200_000 * NAIRA,
    maxBalance: 500_000 * NAIRA,
  },
  3: {
    minAmount: MIN_AMOUNT,
    singleMax: 5_000_000 * NAIRA,
    dailyMax: 5_000_000 * NAIRA,
    maxBalance: null,
  },
};

// Placeholder business limits — merchants collect payments, so no balance cap.
const MERCHANT_LIMITS: TransferLimits = {
  minAmount: MIN_AMOUNT,
  singleMax: 5_000_000 * NAIRA,
  dailyMax: 10_000_000 * NAIRA,
  maxBalance: null,
};

/** null when the user can't transfer at all (no verified BVN, i.e. tier 0). */
export function getTransferLimits(user: User): TransferLimits | null {
  if (user.kycTier < 1) return null;
  if (user.role === UserRole.MERCHANT) return MERCHANT_LIMITS;
  return CONSUMER_LIMITS[Math.min(user.kycTier, 3)];
}

export function formatNaira(kobo: number): string {
  return `₦${(kobo / NAIRA).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
}
