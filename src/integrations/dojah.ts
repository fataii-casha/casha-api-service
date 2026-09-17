import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/api-error';
import axios from 'axios';

export interface DojahBvnEntity {
  bvn?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  date_of_birth?: string;
  phone_number1?: string;
  gender?: string;
  [key: string]: unknown;
}

export interface DojahBvnResponse {
  entity?: DojahBvnEntity;
  status?: number;
  message?: string;
}

function maskBVN(bvn: string): string {
  if (!bvn || bvn.length < 4) return '****';
  return `${'*'.repeat(Math.max(bvn.length - 4, 0))}${bvn.slice(-4)}`;
}

function extractProviderError(errorData: unknown): string | undefined {
  if (!errorData) return undefined;
  if (typeof errorData === 'string') return errorData;
  if (typeof errorData !== 'object') return String(errorData);

  const data = errorData as Record<string, unknown>;
  return (
    (data.error as string) ||
    (data.message as string) ||
    (data.detail as string) ||
    (data.status as string)
  );
}

function safeStringify(value: unknown): string | undefined {
  if (!value) return undefined;
  const stringValue =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, (key, data) =>
          key.toLowerCase().includes('bvn') ? '[REDACTED]' : data,
        );

  return stringValue.length > 1000 ? `${stringValue.slice(0, 1000)}...` : stringValue;
}

export class DojahIntegration {
  public async verifyBVN(bvn: string): Promise<{ message: string; data: DojahBvnResponse }> {
    const url = `${env.dojahBaseUrl}/api/v1/kyc/bvn/advance`;
    const startedAt = Date.now();
    const maskedBVN = maskBVN(bvn);

    logger.info(
      {
        maskedBVN,
        hasBaseUrl: Boolean(env.dojahBaseUrl),
        hasAppId: Boolean(env.dojahAppId),
        hasSecretKey: Boolean(env.dojahSecretKey),
      },
      'Dojah BVN verification request started',
    );

    try {
      const response = await axios.get<DojahBvnResponse>(url, {
        params: { bvn },
        headers: {
          AppId: env.dojahAppId,
          Authorization: env.dojahSecretKey,
        },
      });

      logger.info(
        {
          maskedBVN,
          status: response.status,
          durationMs: Date.now() - startedAt,
          hasEntity: Boolean(response.data?.entity),
          providerStatus: response.data?.status,
          providerMessage: response.data?.message,
        },
        'Dojah BVN verification request succeeded',
      );

      return { message: 'BVN verification successful', data: response.data };
    } catch (err) {
      let friendlyMessage = 'BVN verification failed. Please try again.';
      let providerError = 'Unknown error';
      let status: number | undefined;
      let responseBody: string | undefined;

      if (axios.isAxiosError(err)) {
        const errorData = err.response?.data;
        status = err.response?.status;
        providerError = extractProviderError(errorData) || err.message;
        responseBody = safeStringify(errorData);

        if (typeof errorData === 'object' && errorData !== null) {
          const error = (errorData as Record<string, unknown>).error;
          if (error === 'Invalid BVN') {
            friendlyMessage = 'The BVN provided is invalid. Please check and try again.';
          } else if (typeof error === 'string' && error.includes('not found')) {
            friendlyMessage = 'BVN record not found. Please verify the details.';
          }
        }
      } else {
        providerError = (err as Error).message;
      }

      logger.error(
        { maskedBVN, status, durationMs: Date.now() - startedAt, providerError, responseBody },
        'Dojah BVN verification request failed',
      );

      if (!status || status >= 500) {
        throw ApiError.serviceUnavailable(
          'BVN verification service is currently unavailable. Please try again.',
        );
      }

      throw ApiError.badRequest(friendlyMessage);
    }
  }
}

export const dojahIntegration = new DojahIntegration();
