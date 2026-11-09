import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WalletAccount } from './walletAccount.entity';
import { User } from '../user/user.entity';

export enum WalletStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}
/**
 * main  — created at onboarding; holds the bank account number, receives funding. One per user.
 * stash — user-created sub-wallet with its own name/colour/icon and balance. Can be spent from,
 *         archived (frozen, hidden) and deleted (archived for 30 days, then closed for good).
 */
export enum WalletType {
  MAIN = 'main',
  STASH = 'stash',
}
export enum WalletProvider {
  STELLAS = 'stellas',
}

/**
 * Balances are kept in kobo and only ever changed through the ledger service, which writes a
 * ledger entry for every movement.
 *   ledgerBalance    — booked balance: everything that has settled.
 *   availableBalance — what the user can spend: ledgerBalance minus funds on hold for
 *                      debits still in flight (e.g. a bank withdrawal awaiting confirmation).
 */
@Entity({ name: 'wallets' })
@Check('CHK_wallets_available_non_negative', '"availableBalance" >= 0')
@Check('CHK_wallets_available_within_ledger', '"availableBalance" <= "ledgerBalance"')
@Index('UQ_wallets_one_main_per_user', ['userId'], { unique: true, where: `"type" = 'main'` })
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'enum', enum: WalletType, default: WalletType.MAIN })
  type!: WalletType;

  @Column({ type: 'varchar', length: 30, default: 'Main' })
  name!: string;

  /** Hex colour, e.g. #4F46E5. null = the app's default. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  color?: string | null;

  /** Icon key from the app's icon set. null = the app's default. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  icon?: string | null;

  /** Set while a stash is archived: hidden from the main list, no money in or out. */
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt?: Date | null;

  /** Set when a stash is deleted: it stays archived and restorable until this time. */
  @Column({ type: 'timestamptz', nullable: true })
  deletionScheduledAt?: Date | null;

  /**
   * When the deletion became permanent. The row is kept (status closed) because its ledger
   * entries must be retained; it is just never shown again.
   */
  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @Column({ type: 'bigint', default: 0 })
  availableBalance!: string;

  @Column({ type: 'bigint', default: 0 })
  ledgerBalance!: string;

  @Column({
    type: 'char',
    length: 3,
    default: 'NGN',
  })
  currency!: string;

  @Column({
    type: 'enum',
    enum: WalletStatus,
    default: WalletStatus.ACTIVE,
  })
  status!: WalletStatus;

  @OneToMany(() => WalletAccount, (account) => account.wallet)
  accounts!: WalletAccount[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
