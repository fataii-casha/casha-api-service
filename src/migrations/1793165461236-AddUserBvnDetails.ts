import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserBvnDetails1793165461236 implements MigrationInterface {
  name = 'AddUserBvnDetails1793165461236';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "bvnEncrypted" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "bvnFirstName" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "bvnLastName" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "bvnMiddleName" character varying(100)`);
    await queryRunner.query(
      `ALTER TABLE "wallet_accounts" ADD CONSTRAINT "UQ_wallet_accounts_provider_account" UNIQUE ("provider", "providerAccountId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_accounts" DROP CONSTRAINT "UQ_wallet_accounts_provider_account"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "bvnMiddleName"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "bvnLastName"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "bvnFirstName"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "bvnEncrypted"`);
  }
}
