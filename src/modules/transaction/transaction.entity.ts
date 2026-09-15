import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type TransactionType = 'qr_payment' | 'funding' | 'withdrawal' | 'p2p_transfer';
export type TransactionStatus = 'pending' | 'success' | 'failed' | 'reversed';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  reference!: string;

  @Column({ type: 'enum', enum: ['qr_payment', 'funding', 'withdrawal', 'p2p_transfer'] })
  type!: TransactionType;

  @Column({ type: 'uuid', nullable: true })
  senderWalletId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  receiverWalletId?: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  senderUserId?: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  receiverUserId?: string | null;

  /** Amount in kobo. */
  @Column({ type: 'int' })
  amount!: number;

  @Column({ type: 'varchar', default: 'NGN' })
  currency!: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'success', 'failed', 'reversed'],
    default: 'pending',
  })
  status!: TransactionStatus;

  @Column({ type: 'uuid', nullable: true })
  qrCodeId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  narration?: string | null;

  @Column({ type: 'varchar', nullable: true })
  failureReason?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
