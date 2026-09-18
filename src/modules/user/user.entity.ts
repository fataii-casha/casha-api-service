import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  CONSUMER = 'consumer',
  MERCHANT = 'merchant',
}

export enum OnboardingStep {
  PHONE_VERIFICATION = 'phone_verification',
  PROFILE = 'profile',
  KYC = 'kyc',
  PIN = 'set_pin',
  WALLET = 'create_wallet',
  COMPLETED = 'completed',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  phone!: string;

  @Column({ type: 'boolean', default: false })
  isPhoneVerified!: boolean;

  // Nullable: collected in the PROFILE onboarding step, not at phone-verify time.
  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  otherName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  dob?: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email?: string;

  @Column({ type: 'boolean', default: false })
  isEmailVerified!: boolean;

  @Column({ type: 'varchar', select: false, nullable: true })
  passwordHash?: string;

  @Column({ type: 'varchar', select: false, nullable: true })
  transactionPinHash?: string;

  // Nullable: role isn't chosen until later in onboarding.
  @Column({ type: 'enum', enum: UserRole, nullable: true })
  role!: UserRole;

  @Column({ type: 'varchar', nullable: true })
  businessName?: string;

  @Column({ type: 'boolean', default: false })
  bvnVerified!: boolean;

  @Column({ type: 'varchar', length: 4, nullable: true })
  bvnLast4?: string;

  @Column({ type: 'smallint', default: 0 })
  kycTier!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({
    type: 'enum',
    enum: OnboardingStep,
    default: OnboardingStep.PHONE_VERIFICATION,
  })
  onboardingStep!: OnboardingStep;

  @Column({ type: 'varchar', nullable: true })
  securityQuestionId?: string;

  @Column({ type: 'varchar', select: false, nullable: true })
  securityAnswerHash?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
