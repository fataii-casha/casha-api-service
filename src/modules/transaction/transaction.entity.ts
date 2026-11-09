import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type TransactionType = 'qr_payment' | 'funding' | 'withdrawal' | 'p2p_transfer' | 'reversal';
export type TransactionStatus = 'pending' | 'success' | 'failed' | 'reversed';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  reference!: string;

  @Column({
    type: 'enum',
    enum: ['qr_payment', 'funding', 'withdrawal', 'p2p_transfer', 'reversal'],
  })
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

  /** Amount in kobo. bigint column, so TypeORM returns it as a string. */
  @Column({ type: 'bigint' })
  amount!: string;

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

  /** For a reversal: the transaction it reverses. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  parentTransactionId?: string | null;

  /** Provider references and other context (e.g. Stellas session id). Never put secrets here. */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  /** When the transaction reached a final status (success, failed or reversed). */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  /** clock_timestamp() for posting order under concurrency — see LedgerEntry.createdAt. */
  @CreateDateColumn({ default: () => 'clock_timestamp()' })
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
