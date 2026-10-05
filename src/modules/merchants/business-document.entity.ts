import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum BusinessDocumentType {
  CAC_CERTIFICATE = 'cac_certificate',
  CAC_STATUS_REPORT = 'cac_status_report',
  PROOF_OF_ADDRESS = 'proof_of_address',
  OWNER_VALID_ID = 'owner_valid_id',
}

@Entity('business_documents')
@Index(['businessId', 'documentType'], { unique: true })
export class BusinessDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  businessId!: string;

  @Column({ type: 'enum', enum: BusinessDocumentType })
  documentType!: BusinessDocumentType;

  @Column({ type: 'varchar' })
  fileUrl!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
