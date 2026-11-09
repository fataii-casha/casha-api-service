import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { AppDataSource } from '../../config/data-source';
import { Wallet, WalletProvider } from './wallet.entity';
import { WalletAccount } from './walletAccount.entity';
import { ApiError } from '../../utils/api-error';
import { OnboardingStep, User } from '../user/user.entity';
import { env } from '../../config/env';
import { decrypt } from '../../utils/crypto';
import { StellasVirtualAccount, stellasIntegration } from '../../integrations/stellas';
import { logger } from '../../config/logger';
import { creditWalletFromBank } from '../ledger/ledger.service';

function repo(manager: EntityManager = AppDataSource.manager) {
  return manager.getRepository(Wallet);
}
const userRepo = () => AppDataSource.getRepository(User);
const walletRepo = () => AppDataSource.getRepository(Wallet);

/** Lean lookup for internal use (debit/credit flows) — no user relation. */
export async function getWalletByUserId(userId: string, manager?: EntityManager): Promise<Wallet> {
  const wallet = await repo(manager).findOne({ where: { userId } });
  if (!wallet) {
    throw ApiError.notFound('Wallet not found for this user');
  }
  return wallet;
}

/** For the GET /wallets/me endpoint and the dashboard — includes the linked bank accounts. */
export async function getWalletWithAccountsByUserId(userId: string): Promise<Wallet> {
  const wallet = await repo().findOne({
    where: { userId },
    relations: { accounts: true },
  });

  if (!wallet) {
    throw ApiError.notFound('Wallet not found for this user');
  }

  return wallet;
}

/**
 * Creates the user's wallet together with its Stellas virtual account (the account number
 * the user funds the wallet through). Only allowed after BVN verification, per CBN
 * KYC-tiering rules. Advances onboarding from kyc to create_wallet.
 *
 * Idempotent: an existing wallet is returned as-is, and a wallet created before the
 * Stellas integration gets its virtual account on the next call.
 */
export async function createWalletForUser(
  userId: string,
): Promise<{ user: User; wallet: Wallet; created: boolean }> {
  const user = await userRepo()
    .createQueryBuilder('user')
    .addSelect('user.bvnEncrypted')
    .where('user.id = :userId', { userId })
    .getOne();

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (!user.bvnVerified) {
    throw ApiError.forbidden('Complete BVN verification before creating a wallet');
  }

  const existing = await walletRepo().findOne({
    where: { userId },
    relations: { accounts: true },
  });

  const hasStellasAccount = existing?.accounts.some(
    (account) => account.provider === WalletProvider.STELLAS,
  );
  const wallet = hasStellasAccount ? existing! : await openStellasAccount(user, existing);

  // Only move forward — a retry after the PIN step must not pull the user back.
  if (user.onboardingStep === OnboardingStep.KYC) {
    user.onboardingStep = OnboardingStep.WALLET;
    await userRepo().save(user);
  }

  return {
    user,
    wallet,
    created: !existing,
  };
}

/**
 * Opens the Stellas virtual account, then saves the wallet (if new) and the account in one
 * transaction. Stellas is called first so a provider failure leaves nothing half-created.
 */
async function openStellasAccount(user: User, existingWallet: Wallet | null): Promise<Wallet> {
  if (!user.bvnEncrypted) {
    // BVN verified before we started storing it — it can't be recovered automatically.
    throw ApiError.conflict(
      'We need to re-confirm your BVN before creating your wallet. Please contact support.',
    );
  }

  const firstName = user.bvnFirstName ?? user.firstName;
  const lastName = user.bvnLastName ?? user.lastName;
  if (!firstName || !lastName) {
    throw ApiError.badRequest('Your name is missing. Complete your personal details first.');
  }
  const account = await stellasIntegration.createVirtualAccount({
    firstName,
    lastName,
    bvn: decrypt(user.bvnEncrypted),
    // Deterministic, so a retried request can't open a second account for the same user.
    reference: `venzo_${user.id.replace(/-/g, '')}`,
  });

  try {
    return await saveWalletWithAccount(user, existingWallet, account);
  } catch (err) {
    // The account now exists at Stellas but not in our DB — log enough to reconcile it by hand.
    logger.error(
      {
        err,
        userId: user.id,
        stellasAccount: {
          accountNumber: account.accountNumber,
          accountName: account.accountName,
          clientRef: account.clientRef,
          systemRef: account.systemRef,
        },
      },
      'ACTION NEEDED: Stellas virtual account created but saving it failed',
    );
    throw err;
  }
}

function saveWalletWithAccount(
  user: User,
  existingWallet: Wallet | null,
  account: StellasVirtualAccount,
): Promise<Wallet> {
  return AppDataSource.transaction(async (manager) => {
    const wallet =
      existingWallet ??
      (await repo(manager).save({
        userId: user.id,
        currency: 'NGN',
      }));

    await manager.getRepository(WalletAccount).save({
      walletId: wallet.id,
      provider: WalletProvider.STELLAS,
      providerAccountId: account.systemRef,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      bankName: env.stellasBankName,
      bankCode: env.stellasBankCode,
      isPrimary: true,
    });

    return repo(manager).findOneOrFail({
      where: { id: wallet.id },
      relations: { accounts: true },
    });
  });
}

/** Dev/test-only top-up until bank funding webhooks are wired in. Posts a real funding entry. */
export async function mockFundWallet(userId: string, amount: number): Promise<Wallet> {
  const wallet = await getWalletByUserId(userId);
  await creditWalletFromBank({
    walletId: wallet.id,
    amount,
    reference: `mock_fund_${randomUUID()}`,
    narration: 'Test funding',
    metadata: { source: 'mock-fund' },
  });
  return getWalletWithAccountsByUserId(userId);
}

/**
 * The wallet as every endpoint returns it. Balances are kobo, as numbers — bigint columns,
 * exact as JS numbers below ~₦90 trillion.
 */
export function toWalletView(wallet: Wallet) {
  const accounts = (wallet.accounts ?? []).map((account) => ({
    id: account.id,
    provider: account.provider,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    bankName: account.bankName,
    bankCode: account.bankCode,
    isPrimary: account.isPrimary,
  }));
  const fundingAccount = accounts.find((account) => account.isPrimary) ?? accounts[0] ?? null;

  return {
    id: wallet.id,
    availableBalance: Number(wallet.availableBalance),
    ledgerBalance: Number(wallet.ledgerBalance),
    currency: wallet.currency,
    status: wallet.status,
    fundingAccount,
    accounts,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}
