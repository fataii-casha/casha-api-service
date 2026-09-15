import {
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
  PROVIDER_X = 'provider_x',
  PROVIDER_Y = 'provider_y',
}

@Entity({ name: 'wallets' })
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  userId!: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'bigint', default: 0 })
  balance!: string;

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
