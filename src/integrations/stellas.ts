import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/api-error';

const REQUEST_TIMEOUT_MS = 15_000;
// Transfers took 4–6 s in the sandbox; give them longer before treating the outcome as unknown.
const TRANSFER_TIMEOUT_MS = 45_000;

/** Stellas wraps every payload in this envelope. */
export interface StellasResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

// Shape taken from a live sandbox response, which differs from the docs sample
// (balances are numbers, plus the extra balance fields).
// TODO: confirm with Stellas whether balances are in naira or kobo.
export interface StellasBusinessAccountDetails {
  accountNumber: string;
  accountType: string; // e.g. "corporate"
  customerId: string;
  businessId: string;
  accountBalance: number;
  availableBalance: number;
  ledgerBalance: number;
  withdrawableBalance: number;
  lienAmount: number;
}

export interface CreateVirtualAccountInput {
  firstName: string;
  lastName: string;
  bvn: string;
  reference: string;
  type?: 'permanent';
}

export interface StellasVirtualAccount {
  accountNumber: string;
  accountName: string;
  clientRef: string; // the reference we sent
  systemRef: string; // Stellas' own id, e.g. "STL|jYcphJZcT73yjv"
}

export interface StellasBank {
  name: string;
  bankCode: string; // NIBSS code (requested with nibssCode=true)
}

export interface VirtualAccountTransferInput {
  amountKobo: number;
  payerAccountNumber: string;
  receiverAccountNumber: string;
  receiverBankCode: string; // NIBSS code
  retrievalReference: string; // ours; unique per transfer
  narration: string;
}

/** Stellas answers HTTP 200 / status: true even when the transfer failed — read transactionStatus. */
export interface VirtualAccountTransferResult {
  transactionStatus: string; // seen: "failed", "pending"; success value not yet seen
  amountKobo: number;
  chargeKobo: number; // what Stellas took from the payer on top of the amount
  providerReference?: string; // e.g. "STL|zDGF8RQ…"
  message: string;
}

/** Stellas amounts ↔ kobo, per STELLAS_AMOUNT_UNIT. */
function toStellasAmount(kobo: number): number {
  return env.stellasAmountUnit === 'naira' ? kobo / 100 : kobo;
}
function fromStellasAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return 0;
  return env.stellasAmountUnit === 'naira' ? Math.round(amount * 100) : Math.round(amount);
}

/**
 * Whether a failed call could still have been carried out by Stellas:
 *   not_processed — definitely not (bad request, auth, connection refused/DNS): safe to undo.
 *   unknown       — timeout, dropped connection or 5xx after sending: the transfer may have gone
 *                   through. Never undo these blindly; confirm with a status check first.
 */
export type StellasOutcome = 'not_processed' | 'unknown';

export class StellasRequestError extends ApiError {
  constructor(
    statusCode: number,
    message: string,
    public readonly outcome: StellasOutcome,
    public readonly providerError: string,
  ) {
    super(statusCode, message);
  }
}

const NOT_SENT_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_INVALID_URL']);

function extractProviderError(errorData: unknown): string | undefined {
  if (!errorData) return undefined;
  if (typeof errorData === 'string') return errorData;
  if (typeof errorData !== 'object') return String(errorData);

  const data = errorData as Record<string, unknown>;
  return (data.message as string) || (data.error as string) || (data.detail as string);
}

const MAX_LOGGED_BODY_CHARS = 4000;
const SENSITIVE_KEY = /bvn|secret|api[-_]?key|password|pin/i;

/** JSON-encodes a request/response body for the logs, masking BVNs and credentials. */
function safeStringify(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const stringValue =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, (key, data) => (SENSITIVE_KEY.test(key) ? '[REDACTED]' : data));
  return stringValue.length > MAX_LOGGED_BODY_CHARS
    ? `${stringValue.slice(0, MAX_LOGGED_BODY_CHARS)}...`
    : stringValue;
}

/** Stellas' trace id ({ error: { traceId } }) — quote it when contacting Stellas support. */
function extractTraceId(errorData: unknown): string | undefined {
  const error = (errorData as { error?: { traceId?: unknown } } | undefined)?.error;
  return typeof error?.traceId === 'string' ? error.traceId : undefined;
}

/** Response headers worth keeping in an error log (request ids for Stellas support). */
function pickDebugHeaders(headers: unknown): Record<string, string> | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const picked: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
    if (/request-id|correlation-id|trace-id|^date$|^content-type$/i.test(name)) {
      picked[name] = String(value);
    }
  }
  return Object.keys(picked).length ? picked : undefined;
}

/** Stellas answered HTTP 200 with status: false. */
class StellasRejectedError extends Error {
  constructor(public readonly responseBody: unknown) {
    super((responseBody as { message?: string } | undefined)?.message || 'Banking request failed');
  }
}

export class StellasIntegration {
  private client?: AxiosInstance;

  /** Built on first use so the app still boots before the Stellas credentials are configured. */
  private getClient(): AxiosInstance {
    if (this.client) return this.client;

    if (!env.stellasApiKey || !env.stellasApiSecret || !env.stellasBusinessId) {
      logger.error(
        {
          hasApiKey: Boolean(env.stellasApiKey),
          hasApiSecret: Boolean(env.stellasApiSecret),
          hasBusinessId: Boolean(env.stellasBusinessId),
        },
        'Stellas credentials are not configured',
      );
      throw ApiError.serviceUnavailable('Banking service is not configured');
    }

    this.client = axios.create({
      baseURL: env.stellasBaseUrl,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'x-api-key': env.stellasApiKey,
        'x-api-secret': env.stellasApiSecret,
        businessId: env.stellasBusinessId,
      },
    });
    return this.client;
  }

  /** Account details for Casha's own business account on Stellas. */
  public async getBusinessAccountDetails(): Promise<StellasBusinessAccountDetails> {
    const { data } = await this.request<StellasBusinessAccountDetails>(
      'GET',
      '/clients/business/account-details',
    );
    return data;
  }

  /** Banks reachable by NIP, with their NIBSS codes. */
  public async getBanks(): Promise<StellasBank[]> {
    const { data } = await this.request<StellasBank[]>('GET', '/banks', undefined, {
      params: { nibssCode: true },
    });
    return data;
  }

  /**
   * Sends money from one of our virtual accounts to any bank account (NIP). Resolves for every
   * answer Stellas gives — including failed — so the caller decides from transactionStatus.
   * Throws StellasRequestError when no answer came back; check its outcome before undoing.
   */
  public async transferFromVirtualAccount(
    input: VirtualAccountTransferInput,
  ): Promise<VirtualAccountTransferResult> {
    const response = await this.request<{
      transactionStatus?: string;
      amount?: unknown;
      transactionCharge?: unknown;
      transactionReference?: string;
    }>(
      'POST',
      '/clients/business/virtual-accounts/transfer',
      {
        amount: toStellasAmount(input.amountKobo),
        payerAccountNumber: input.payerAccountNumber,
        receiverAccountNumber: input.receiverAccountNumber,
        receiverBankCode: input.receiverBankCode,
        retrievalReference: input.retrievalReference,
        narration: input.narration,
      },
      { timeout: TRANSFER_TIMEOUT_MS },
    );

    return {
      transactionStatus: String(response.data?.transactionStatus ?? '').toLowerCase(),
      amountKobo: fromStellasAmount(response.data?.amount),
      chargeKobo: fromStellasAmount(response.data?.transactionCharge),
      providerReference: response.data?.transactionReference,
      message: response.message,
    };
  }

  /** Opens a virtual account under Casha's business on Stellas. reference must be unique per account. */
  public async createVirtualAccount(
    input: CreateVirtualAccountInput,
  ): Promise<StellasVirtualAccount> {
    const { data } = await this.request<StellasVirtualAccount>(
      'POST',
      '/clients/business/virtual-accounts',
      { type: 'permanent', ...input },
    );
    return data;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options: { params?: Record<string, unknown>; timeout?: number } = {},
  ): Promise<StellasResponse<T>> {
    const client = this.getClient();
    const startedAt = Date.now();

    try {
      const response = await client.request<StellasResponse<T>>({
        method,
        url: path,
        data: body,
        params: options.params,
        timeout: options.timeout,
      });

      logger.info(
        {
          method,
          path,
          status: response.status,
          durationMs: Date.now() - startedAt,
          providerMessage: response.data?.message,
        },
        'Stellas request succeeded',
      );

      if (response.data?.status === false) {
        throw new StellasRejectedError(response.data);
      }

      return response.data;
    } catch (err) {
      let status: number | undefined;
      let providerError = 'Unknown error';
      let outcome: StellasOutcome = 'not_processed';
      // Everything needed to debug a failed call. Never log err.config: it holds our API secret.
      const details: Record<string, unknown> = {
        method,
        url: `${env.stellasBaseUrl}${path}`,
        durationMs: Date.now() - startedAt,
        requestBody: safeStringify(body),
      };

      if (axios.isAxiosError(err)) {
        status = err.response?.status;
        providerError = extractProviderError(err.response?.data) || err.message;
        // No answer, or a 5xx: the request may have been acted on unless it never left us.
        if (err.response ? err.response.status >= 500 : !NOT_SENT_ERROR_CODES.has(err.code ?? '')) {
          outcome = 'unknown';
        }
        Object.assign(details, {
          failure: err.response ? 'http_error' : 'network_error', // no response = timeout/DNS/refused
          status,
          traceId: extractTraceId(err.response?.data),
          errorCode: err.code, // e.g. ECONNABORTED (timeout), ENOTFOUND, ECONNREFUSED
          errorMessage: err.message,
          responseBody: safeStringify(err.response?.data),
          responseHeaders: pickDebugHeaders(err.response?.headers),
        });
      } else if (err instanceof StellasRejectedError) {
        status = 400; // HTTP 200 but status: false — treat like a provider 400
        providerError = err.message;
        Object.assign(details, {
          failure: 'rejected', // HTTP 200 with status: false
          status: 200,
          traceId: extractTraceId(err.responseBody),
          responseBody: safeStringify(err.responseBody),
        });
      } else {
        providerError = (err as Error).message;
        outcome = 'unknown'; // we can't tell how far it got
        Object.assign(details, { failure: 'unexpected', err });
      }
      details.outcome = outcome;

      logger.error(
        { stellas: { ...details, providerError } },
        `Stellas request failed: ${providerError}`,
      );

      // Problems on Casha's side the user can't fix — bad credentials (401/403), or our Stellas
      // business account can't cover the fee — become a generic outage. The provider message
      // would also leak Casha's own account number.
      const isOurSide = /insufficient funds/i.test(providerError);
      if (isOurSide) {
        logger.error(
          { stellas: { url: details.url, providerError } },
          'ACTION NEEDED: Stellas business account needs funding',
        );
      }
      if (!status || status >= 500 || status === 401 || status === 403 || isOurSide) {
        throw new StellasRequestError(
          503,
          'Banking service is currently unavailable. Please try again.',
          outcome,
          providerError,
        );
      }

      throw new StellasRequestError(400, providerError, outcome, providerError);
    }
  }
}

export const stellasIntegration = new StellasIntegration();
