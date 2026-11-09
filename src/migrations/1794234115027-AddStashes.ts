import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stashes: a user can now own several wallets — one main (enforced by a partial unique index)
 * plus named stashes with colour, icon, archive and 30-day deletion. Existing wallets become
 * main wallets named "Main".
 */

export class AddStashes1794234115027 implements MigrationInterface {
  name = 'AddStashes1794234115027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."wallets_type_enum" AS ENUM('main', 'stash')`);
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD "type" "public"."wallets_type_enum" NOT NULL DEFAULT 'main'`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD "name" character varying(30) NOT NULL DEFAULT 'Main'`,
    );
    await queryRunner.query(`ALTER TABLE "wallets" ADD "color" character varying(7)`);
    await queryRunner.query(`ALTER TABLE "wallets" ADD "icon" character varying(50)`);
    await queryRunner.query(`ALTER TABLE "wallets" ADD "archivedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD "deletionScheduledAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "wallets" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "UQ_2ecdb33f23e9a6fc392025c0b97"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_type_enum" ADD VALUE 'wallet_transfer'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2ecdb33f23e9a6fc392025c0b9" ON "wallets"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_wallets_one_main_per_user" ON "wallets"  ("userId") WHERE "type" = 'main'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_234520b8d2b63e97a7875b66ab" ON "transactions"  ("senderWalletId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ffdc7a29d1be1b4e3aff2919df" ON "transactions"  ("receiverWalletId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "wallets" WHERE "type" = 'stash'`,
    );
    if (count > 0) {
      // Stashes have ledger history that must be kept; they can't be folded back into one wallet.
      throw new Error(`Cannot revert AddStashes: ${count} stash wallet(s) exist`);
    }
    await queryRunner.query(`DELETE FROM "transactions" WHERE "type" = 'wallet_transfer'`);
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_ffdc7a29d1be1b4e3aff2919df"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_234520b8d2b63e97a7875b66ab"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_wallets_one_main_per_user"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2ecdb33f23e9a6fc392025c0b9"`);
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_type_enum_old" AS ENUM('qr_payment', 'funding', 'withdrawal', 'p2p_transfer', 'reversal')`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "type" TYPE "public"."transactions_type_enum_old" USING "type"::"text"::"public"."transactions_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_type_enum_old" RENAME TO "transactions_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "UQ_2ecdb33f23e9a6fc392025c0b97" UNIQUE ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "deletedAt"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "deletionScheduledAt"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "archivedAt"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "icon"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "color"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "name"`);
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "public"."wallets_type_enum"`);
  }
}
