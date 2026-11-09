import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Double-entry ledger: ledger_entries table, available + ledger balances on wallets
 * (replacing the single balance column), bigint transaction amounts, and reversal support.
 * Existing balances are kept and booked as an opening-balance entry so every wallet
 * reconciles against its ledger from the start.
 */
export class AddLedger1793944434123 implements MigrationInterface {
  name = 'AddLedger1793944434123';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Wallet balances — rename rather than drop so existing balances survive.
    await queryRunner.query(`ALTER TABLE "wallets" RENAME COLUMN "balance" TO "availableBalance"`);
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD "ledgerBalance" bigint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`UPDATE "wallets" SET "ledgerBalance" = "availableBalance"`);
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "CHK_wallets_available_within_ledger" CHECK ("availableBalance" <= "ledgerBalance")`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "CHK_wallets_available_non_negative" CHECK ("availableBalance" >= 0)`,
    );

    // Transactions
    await queryRunner.query(`ALTER TYPE "public"."transactions_type_enum" ADD VALUE 'reversal'`);
    await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE bigint`);
    // clock_timestamp(): rows are inserted after the wallet locks are taken, so this sorts in
    // posting order even under concurrency (now() is the DB transaction's start time).
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "createdAt" SET DEFAULT clock_timestamp()`,
    );
    await queryRunner.query(`ALTER TABLE "transactions" ADD "parentTransactionId" uuid`);
    await queryRunner.query(`ALTER TABLE "transactions" ADD "metadata" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD "completedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d3e8112cc4d6ffbc5c462f3672" ON "transactions" ("parentTransactionId")`,
    );

    // Ledger entries
    await queryRunner.query(
      `CREATE TYPE "public"."ledger_entries_systemaccount_enum" AS ENUM('bank_settlement')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ledger_entries_direction_enum" AS ENUM('debit', 'credit')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ledger_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "transactionId" uuid NOT NULL, "walletId" uuid, "systemAccount" "public"."ledger_entries_systemaccount_enum", "direction" "public"."ledger_entries_direction_enum" NOT NULL, "amount" bigint NOT NULL, "balanceBefore" bigint, "balanceAfter" bigint, "createdAt" TIMESTAMP NOT NULL DEFAULT clock_timestamp(), CONSTRAINT "CHK_ledger_entries_one_account" CHECK (("walletId" IS NULL) <> ("systemAccount" IS NULL)), CONSTRAINT "CHK_ledger_entries_amount_positive" CHECK ("amount" > 0), CONSTRAINT "PK_6efcb84411d3f08b08450ae75d5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ce01dd5f8bde23f503bf01ffac" ON "ledger_entries" ("transactionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ledger_entries_wallet_created" ON "ledger_entries" ("walletId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ADD CONSTRAINT "FK_ce01dd5f8bde23f503bf01ffacc" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ADD CONSTRAINT "FK_df977c08d98fab6543724d74859" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // Opening balances: one funding transaction per wallet that already holds money.
    // ('funding' rather than the new 'reversal' value — enum values added in this
    // transaction can't be used until it commits.)
    await queryRunner.query(`
      INSERT INTO "transactions" ("reference", "type", "receiverWalletId", "receiverUserId", "amount", "currency", "status", "narration", "metadata", "completedAt")
      SELECT 'opening_balance_' || w."id", 'funding', w."id", w."userId", w."ledgerBalance", w."currency", 'success', 'Opening balance', '{"source":"opening-balance"}', now()
        FROM "wallets" w WHERE w."ledgerBalance" > 0`);
    await queryRunner.query(`
      INSERT INTO "ledger_entries" ("transactionId", "systemAccount", "direction", "amount")
      SELECT t."id", 'bank_settlement', 'debit', t."amount"
        FROM "transactions" t WHERE t."reference" LIKE 'opening\\_balance\\_%'`);
    await queryRunner.query(`
      INSERT INTO "ledger_entries" ("transactionId", "walletId", "direction", "amount", "balanceBefore", "balanceAfter")
      SELECT t."id", t."receiverWalletId", 'credit', t."amount", 0, t."amount"
        FROM "transactions" t WHERE t."reference" LIKE 'opening\\_balance\\_%'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ledger_entries"`);
    await queryRunner.query(`DROP TYPE "public"."ledger_entries_direction_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ledger_entries_systemaccount_enum"`);
    await queryRunner.query(
      `DELETE FROM "transactions" WHERE "reference" LIKE 'opening\\_balance\\_%'`,
    );

    // Reversal rows can't survive the enum downgrade.
    await queryRunner.query(`DELETE FROM "transactions" WHERE "type" = 'reversal'`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d3e8112cc4d6ffbc5c462f3672"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "completedAt"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "metadata"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "parentTransactionId"`);
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "createdAt" SET DEFAULT now()`,
    );
    await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE integer`);
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_type_enum_old" AS ENUM('qr_payment', 'funding', 'withdrawal', 'p2p_transfer')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" TYPE "public"."transactions_type_enum_old" USING "type"::"text"::"public"."transactions_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_type_enum_old" RENAME TO "transactions_type_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "CHK_wallets_available_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "CHK_wallets_available_within_ledger"`,
    );
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "ledgerBalance"`);
    await queryRunner.query(`ALTER TABLE "wallets" RENAME COLUMN "availableBalance" TO "balance"`);
  }
}
