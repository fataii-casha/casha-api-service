import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
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
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  userId!: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;

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
