import { ApiError } from './api-error';

/**
 * Accepts Nigerian numbers in any common input shape:
 *   08012345678, 8012345678, 2348012345678, +2348012345678
 * Normalizes all of them to E.164: +2348012345678
 */
export function normalizeNigerianPhone(raw: string): string {
  const digitsOnly = raw.replace(/[^\d]/g, '');

  let localDigits: string | null = null;

  if (/^0[789][01]\d{8}$/.test(digitsOnly)) {
    // 0801... (11 digits, leading 0)
    localDigits = digitsOnly.slice(1);
  } else if (/^234[789][01]\d{8}$/.test(digitsOnly)) {
    // 234801... (13 digits, no plus)
    localDigits = digitsOnly.slice(3);
  } else if (/^[789][01]\d{8}$/.test(digitsOnly)) {
    // 801... (10 digits, no prefix at all)
    localDigits = digitsOnly;
  }

  if (!localDigits) {
    throw ApiError.badRequest('Enter a valid Nigerian phone number');
  }

  return `+234${localDigits}`;
}
