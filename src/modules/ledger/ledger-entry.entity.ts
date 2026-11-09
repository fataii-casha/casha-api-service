import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Transaction } from '../transaction/transaction.entity';
import { Wallet } from '../wallet/wallet.entity';

export enum EntryDirection {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

/**
 * Accounts outside any user's wallet that money moves to or from. Every transaction's
 * entries balance (total debits = total credits), so money entering Casha through the bank
 * is booked against BANK_SETTLEMENT rather than appearing from nowhere.
 */
export enum SystemAccount {
  BANK_SETTLEMENT = 'bank_settlement',
}

/**
 * One line of the double-entry ledger. Append-only: entries are never updated or deleted —
 * mistakes are corrected with a reversal transaction.
 *
 * Exactly one of walletId / systemAccount is set. Wallet entries record the wallet's ledger
 * balance before and after the movement.
 */
@Entity({ name: 'ledger_entries' })
@Index('IDX_ledger_entries_wallet_created', ['walletId', 'createdAt'])
@Check('CHK_ledger_entries_amount_positive', '"amount" > 0')
@Check('CHK_ledger_entries_one_account', '("walletId" IS NULL) <> ("systemAccount" IS NULL)')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'transactionId' })
  transaction!: Transaction;

  @Column({ type: 'uuid', nullable: true })
  walletId?: string | null;

  @ManyToOne(() => Wallet, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'walletId' })
  wallet?: Wallet | null;

  @Column({ type: 'enum', enum: SystemAccount, nullable: true })
  systemAccount?: SystemAccount | null;

  @Column({ type: 'enum', enum: EntryDirection })
  direction!: EntryDirection;

  /** Kobo. bigint, returned as a string. */
  @Column({ type: 'bigint' })
  amount!: string;

  /** The wallet's ledger balance before/after this entry. null for system accounts. */
  @Column({ type: 'bigint', nullable: true })
  balanceBefore?: string | null;

  @Column({ type: 'bigint', nullable: true })
  balanceAfter?: string | null;

  /**
   * clock_timestamp(), not now(): now() is when the DB transaction began, before it waited
   * for the wallet lock, so concurrent postings would sort out of order.
   */
  @CreateDateColumn({ default: () => 'clock_timestamp()' })
  createdAt!: Date;
}
