import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

export enum BusinessVerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  ownerId!: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'ownerId' })
  owner?: User;

  @Column({ type: 'varchar', length: 150 })
  businessName!: string;

  @Column({ type: 'varchar', length: 100 })
  industry!: string;

  @Column({ type: 'boolean' })
  isRegistered!: boolean;

  @Column({ type: 'varchar', nullable: true })
  rcNumber?: string;

  @Column({ type: 'varchar', nullable: true })
  addressLine1?: string;

  @Column({ type: 'varchar', nullable: true })
  addressLine2?: string;

  @Column({ type: 'varchar', nullable: true })
  city?: string;

  @Column({ type: 'varchar', nullable: true })
  state?: string;

  @Column({ type: 'varchar', default: 'Nigeria' })
  country!: string;

  @Column({ type: 'varchar', nullable: true })
  logoUrl?: string;

  @Column({
    type: 'enum',
    enum: BusinessVerificationStatus,
    default: BusinessVerificationStatus.PENDING,
  })
  verificationStatus!: BusinessVerificationStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
