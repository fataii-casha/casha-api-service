import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1791197139229 implements MigrationInterface {
    name = 'InitialSchema1791197139229'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('consumer', 'merchant')`);
        await queryRunner.query(`CREATE TYPE "public"."users_onboardingstep_enum" AS ENUM('phone_verification', 'profile', 'business_info', 'business_documents', 'business_address', 'business_logo', 'owner_details', 'kyc', 'set_pin', 'create_wallet', 'completed')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "phone" character varying NOT NULL, "isPhoneVerified" boolean NOT NULL DEFAULT false, "firstName" character varying(100), "lastName" character varying(100), "otherName" character varying(100), "dob" character varying(100), "email" character varying, "isEmailVerified" boolean NOT NULL DEFAULT false, "passwordHash" character varying, "transactionPinHash" character varying, "role" "public"."users_role_enum", "businessName" character varying, "bvnVerified" boolean NOT NULL DEFAULT false, "bvnLast4" character varying(4), "kycTier" smallint NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "isPoliticallyExposed" boolean, "onboardingStep" "public"."users_onboardingstep_enum" NOT NULL DEFAULT 'phone_verification', "securityQuestionId" character varying, "securityAnswerHash" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a000cca60bcf04454e727699490" UNIQUE ("phone"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "wallet_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "walletId" uuid NOT NULL, "provider" character varying(50) NOT NULL, "providerAccountId" character varying(100) NOT NULL, "accountNumber" character varying(20) NOT NULL, "accountName" character varying(150) NOT NULL, "bankName" character varying(100) NOT NULL, "bankCode" character varying(10) NOT NULL, "isPrimary" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d29a782bf4203c2ed2b613353d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."wallets_status_enum" AS ENUM('active', 'suspended', 'closed')`);
        await queryRunner.query(`CREATE TABLE "wallets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "balance" bigint NOT NULL DEFAULT '0', "currency" character(3) NOT NULL DEFAULT 'NGN', "status" "public"."wallets_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2ecdb33f23e9a6fc392025c0b97" UNIQUE ("userId"), CONSTRAINT "REL_2ecdb33f23e9a6fc392025c0b9" UNIQUE ("userId"), CONSTRAINT "PK_8402e5df5a30a229380e83e4f7e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."qr_codes_type_enum" AS ENUM('static', 'dynamic')`);
        await queryRunner.query(`CREATE TYPE "public"."qr_codes_status_enum" AS ENUM('active', 'used', 'expired', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "qr_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "ownerId" uuid NOT NULL, "type" "public"."qr_codes_type_enum" NOT NULL, "amount" integer, "currency" character varying NOT NULL DEFAULT 'NGN', "status" "public"."qr_codes_status_enum" NOT NULL DEFAULT 'active', "narration" character varying, "expiresAt" TIMESTAMP WITH TIME ZONE, "usedAt" TIMESTAMP WITH TIME ZONE, "usedByTransactionId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8a8ba2310839f388674c1b095c8" UNIQUE ("code"), CONSTRAINT "PK_4b7aa338e150a878ce9e2c55c5c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_31d68eec6f6b6dcd5b2825793c" ON "qr_codes"  ("ownerId", "type", "status") `);
        await queryRunner.query(`CREATE TYPE "public"."transactions_type_enum" AS ENUM('qr_payment', 'funding', 'withdrawal', 'p2p_transfer')`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_status_enum" AS ENUM('pending', 'success', 'failed', 'reversed')`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" character varying NOT NULL, "type" "public"."transactions_type_enum" NOT NULL, "senderWalletId" uuid, "receiverWalletId" uuid, "senderUserId" uuid, "receiverUserId" uuid, "amount" integer NOT NULL, "currency" character varying NOT NULL DEFAULT 'NGN', "status" "public"."transactions_status_enum" NOT NULL DEFAULT 'pending', "qrCodeId" uuid, "narration" character varying, "failureReason" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_dd85cc865e0c3d5d4be095d3f3f" UNIQUE ("reference"), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c140a73c8fd9148a3e4eac42da" ON "transactions"  ("senderUserId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8fb4c75b198fd4109f75d389f7" ON "transactions"  ("receiverUserId") `);
        await queryRunner.query(`CREATE TYPE "public"."businesses_verificationstatus_enum" AS ENUM('pending', 'verified', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "businesses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownerId" uuid NOT NULL, "businessName" character varying(150) NOT NULL, "industry" character varying(100) NOT NULL, "isRegistered" boolean NOT NULL, "rcNumber" character varying, "addressLine1" character varying, "addressLine2" character varying, "city" character varying, "state" character varying, "country" character varying NOT NULL DEFAULT 'Nigeria', "logoUrl" character varying, "verificationStatus" "public"."businesses_verificationstatus_enum" NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_02e7bfb8e766e8e0ef449cc0f36" UNIQUE ("ownerId"), CONSTRAINT "REL_02e7bfb8e766e8e0ef449cc0f3" UNIQUE ("ownerId"), CONSTRAINT "PK_bc1bf63498dd2368ce3dc8686e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."business_documents_documenttype_enum" AS ENUM('cac_certificate', 'cac_status_report', 'proof_of_address', 'owner_valid_id')`);
        await queryRunner.query(`CREATE TABLE "business_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "businessId" uuid NOT NULL, "documentType" "public"."business_documents_documenttype_enum" NOT NULL, "fileUrl" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_860ab003b3f784b2492a245ee45" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2a73fc283a035aecea042e318f" ON "business_documents"  ("businessId", "documentType") `);
        await queryRunner.query(`ALTER TABLE "wallet_accounts" ADD CONSTRAINT "FK_6c625bed2b075250e2a33d04c8a" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wallets" ADD CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "businesses" ADD CONSTRAINT "FK_02e7bfb8e766e8e0ef449cc0f36" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "businesses" DROP CONSTRAINT "FK_02e7bfb8e766e8e0ef449cc0f36"`);
        await queryRunner.query(`ALTER TABLE "wallets" DROP CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97"`);
        await queryRunner.query(`ALTER TABLE "wallet_accounts" DROP CONSTRAINT "FK_6c625bed2b075250e2a33d04c8a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2a73fc283a035aecea042e318f"`);
        await queryRunner.query(`DROP TABLE "business_documents"`);
        await queryRunner.query(`DROP TYPE "public"."business_documents_documenttype_enum"`);
        await queryRunner.query(`DROP TABLE "businesses"`);
        await queryRunner.query(`DROP TYPE "public"."businesses_verificationstatus_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8fb4c75b198fd4109f75d389f7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c140a73c8fd9148a3e4eac42da"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_31d68eec6f6b6dcd5b2825793c"`);
        await queryRunner.query(`DROP TABLE "qr_codes"`);
        await queryRunner.query(`DROP TYPE "public"."qr_codes_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."qr_codes_type_enum"`);
        await queryRunner.query(`DROP TABLE "wallets"`);
        await queryRunner.query(`DROP TYPE "public"."wallets_status_enum"`);
        await queryRunner.query(`DROP TABLE "wallet_accounts"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_onboardingstep_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
