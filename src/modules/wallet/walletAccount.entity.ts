import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';

@Entity({ name: 'wallet_accounts' })
@Unique('UQ_wallet_accounts_provider_account', ['provider', 'providerAccountId'])
export class WalletAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  walletId!: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.accounts, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walletId' })
  wallet!: Wallet;

  @Column({
    type: 'varchar',
    length: 50,
  })
  provider!: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  providerAccountId!: string;

  @Column({
    type: 'varchar',
    length: 20,
  })
  accountNumber!: string;

  @Column({
    type: 'varchar',
    length: 150,
  })
  accountName!: string;

  @Column({
    type: 'varchar',
    length: 100,
  })
  bankName!: string;

  @Column({
    type: 'varchar',
    length: 10,
  })
  bankCode!: string;

  @Column({
    type: 'boolean',
    default: false,
  })
  isPrimary!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
