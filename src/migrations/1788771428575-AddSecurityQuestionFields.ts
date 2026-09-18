import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSecurityQuestionFields1788771428575 implements MigrationInterface {
  name = 'AddSecurityQuestionFields1788771428575';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD "securityQuestionId" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD "securityAnswerHash" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "securityAnswerHash"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "securityQuestionId"
    `);
  }
}
