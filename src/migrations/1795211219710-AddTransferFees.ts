import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Bank-transfer fees: a fee column on transactions and a FEE_INCOME ledger account. */

export class AddTransferFees1795211219710 implements MigrationInterface {
  name = 'AddTransferFees1795211219710';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transactions" ADD "fee" bigint NOT NULL DEFAULT '0'`);
    await queryRunner.query(
      `ALTER TYPE "public"."ledger_entries_systemaccount_enum" ADD VALUE 'fee_income'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "ledger_entries" WHERE "systemAccount" = 'fee_income'`,
    );
    if (count > 0) {
      throw new Error(`Cannot revert AddTransferFees: ${count} fee ledger entries exist`);
    }
    await queryRunner.query(
      `CREATE TYPE "public"."ledger_entries_systemaccount_enum_old" AS ENUM('bank_settlement')`,
    );
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ALTER COLUMN "systemAccount" TYPE "public"."ledger_entries_systemaccount_enum_old" USING "systemAccount"::"text"::"public"."ledger_entries_systemaccount_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ledger_entries_systemaccount_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."ledger_entries_systemaccount_enum_old" RENAME TO "ledger_entries_systemaccount_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "fee"`);
  }
}
