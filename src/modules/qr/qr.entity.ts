import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type QrType = 'static' | 'dynamic';
export type QrStatus = 'active' | 'used' | 'expired' | 'cancelled';

@Entity('qr_codes')
@Index(['ownerId', 'type', 'status'])
export class QrCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  code!: string;

  @Column({ type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'enum', enum: ['static', 'dynamic'] })
  type!: QrType;

  /** Fixed amount in kobo. Null for static merchant codes where the payer enters the amount. */
  @Column({ type: 'int', nullable: true })
  amount!: number | null;

  @Column({ type: 'varchar', default: 'NGN' })
  currency!: string;

  @Column({ type: 'enum', enum: ['active', 'used', 'expired', 'cancelled'], default: 'active' })
  status!: QrStatus;

  @Column({ type: 'varchar', nullable: true })
  narration?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  usedByTransactionId?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
