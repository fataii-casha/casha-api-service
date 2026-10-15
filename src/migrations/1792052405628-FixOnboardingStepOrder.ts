import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves users stuck under the old step order onto the new one
 * (kyc → create_wallet → set_pin → completed, for consumers and merchants).
 */
export class FixOnboardingStepOrder1792052405628 implements MigrationInterface {
  name = 'FixOnboardingStepOrder1792052405628';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PIN set and wallet created: onboarding is actually done.
    await queryRunner.query(
      `UPDATE "users" SET "onboardingStep" = 'completed'
       WHERE "onboardingStep" = 'set_pin'
         AND EXISTS (SELECT 1 FROM "wallets" w WHERE w."userId" = "users"."id")`,
    );
    // PIN set but wallet skipped: send them back to create the wallet, then set the PIN again.
    await queryRunner.query(
      `UPDATE "users" SET "onboardingStep" = 'kyc'
       WHERE "onboardingStep" = 'set_pin'
         AND NOT EXISTS (SELECT 1 FROM "wallets" w WHERE w."userId" = "users"."id")`,
    );
    // Wallet created under the old code, which left the step at kyc.
    await queryRunner.query(
      `UPDATE "users" SET "onboardingStep" = 'create_wallet'
       WHERE "onboardingStep" = 'kyc'
         AND EXISTS (SELECT 1 FROM "wallets" w WHERE w."userId" = "users"."id")`,
    );
  }

  public async down(): Promise<void> {
    // Data-only fix; the previous states were invalid, so there is nothing to restore.
  }
}
