/**
 * SS-031 — KYC entities.
 *
 * Two tables (defined in migration 1718160000010-AddKycTables):
 *
 *   kyc_records     — one row per (tenantId, submission). Stores the
 *                     structured KYC payload (PAN, GSTIN, bank last 4,
 *                     IFSC) and the verification status. Tenants are
 *                     allowed multiple submissions (re-submission after
 *                     a REJECTED state) so the table is append-only.
 *
 *   kyc_documents   — child rows for uploaded supporting documents
 *                     (PAN card image, GST certificate, bank statement,
 *                     cancelled cheque). Each row stores the S3 key —
 *                     the actual bytes live in the configured storage
 *                     driver.
 *
 * Status machine:
 *   PENDING → UNDER_REVIEW → VERIFIED
 *                       └→ REJECTED
 *
 * The PENDING / UNDER_REVIEW boundary is set when the KYC worker picks
 * the job off the BullMQ queue; VERIFIED / REJECTED is the worker's
 * terminal decision.
 */
import {
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

export enum KycStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum KycDocumentType {
  PAN = 'PAN',
  GSTIN = 'GSTIN',
  BANK_STATEMENT = 'BANK_STATEMENT',
  CANCELLED_CHEQUE = 'CANCELLED_CHEQUE',
}

@Entity('kyc_records')
@Index('kyc_records_tenantId_idx', ['tenantId'])
@Index('kyc_records_tenant_status_idx', ['tenantId', 'status'])
export class KycRecordEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @Column({ type: 'int', nullable: true })
  userId?: number | null;

  @Column({ type: 'varchar', length: 16 })
  pan!: string;

  @Column({ type: 'varchar', length: 16 })
  gstin!: string;

  /** Last 4 digits of the bank account — we never store the full number. */
  @Column({ type: 'varchar', length: 4 })
  bankAccountLast4!: string;

  @Column({ type: 'varchar', length: 11 })
  ifsc!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  accountHolderName?: string | null;

  @Column({
    type: 'enum',
    enum: KycStatus,
    default: KycStatus.PENDING,
  })
  status!: KycStatus;

  /** Provider reference id (e.g. Setu penny-drop txn id). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  providerRef?: string | null;

  /** Free-text reason when status = REJECTED. */
  @Column({ type: 'text', nullable: true })
  rejectionReason?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  submittedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => KycDocumentEntity, (d) => d.kycRecord, { cascade: true })
  documents?: KycDocumentEntity[];
}

@Entity('kyc_documents')
@Index('kyc_documents_record_idx', ['kycRecordId'])
export class KycDocumentEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  kycRecordId!: number;

  @ManyToOne(() => KycRecordEntity, (k) => k.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kycRecordId' })
  kycRecord?: KycRecordEntity;

  @Column({
    type: 'enum',
    enum: KycDocumentType,
  })
  docType!: KycDocumentType;

  /** S3 / storage-driver key. Bytes live in the configured bucket. */
  @Column({ type: 'varchar', length: 512 })
  s3Key!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentType?: string | null;

  @Column({ type: 'int', nullable: true })
  sizeBytes?: number | null;

  @CreateDateColumn()
  uploadedAt!: Date;
}
