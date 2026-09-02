import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import {
  InvoiceStatus,
  PaymentGateway,
  PaymentMethod,
  PaymentReconciliationStatus,
  PaymentStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../enums';
import { UserEntity } from './identity.entities';
import { OrderEntity } from './commerce.entities';
import { WarehouseEntity, WarehouseSellerProfileEntity } from './warehouse.entities';
import { EwayBillEntity } from './shipping.entities';

/**
 * Payment — money moving through Stripe or Razorpay. Optional links to an
 * Order, Invoice, and Refunds. Status lifecycle is `PaymentStatus`.
 */
@Entity('payments')
@Index('payments_userId_idx', ['userId'])
@Index('payments_orderId_idx', ['orderId'])
@Index('payments_invoiceId_idx', ['invoiceId'])
@Index('payments_gatewayPaymentId_idx', ['gatewayPaymentId'])
@Index('payments_status_idx', ['status'])
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  userId!: number;
  @ManyToOne(() => UserEntity, (u) => u.payments)
  user?: UserEntity;

  @Column({ type: 'int', nullable: true })
  orderId?: number | null;
  @ManyToOne(() => OrderEntity, (o) => o.payments)
  @JoinColumn({ name: "orderId" })
  order?: OrderEntity | null;

  @Column({ type: 'uuid', nullable: true })
  invoiceId?: string | null;
  @ManyToOne(() => InvoiceEntity, (i) => i.payments)
  @JoinColumn({ name: "invoiceId" })
  invoice?: InvoiceEntity | null;

  @Column({ type: 'double precision' })
  amount!: number;

  @Column({ type: 'varchar', length: 8, default: 'INR' })
  currency!: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @Column({ type: 'enum', enum: PaymentGateway })
  gateway!: PaymentGateway;

  @Column({ type: 'varchar', length: 128, nullable: true })
  gatewayPaymentId?: string | null;

  @Column({ type: 'int', default: 1 })
  @Index('idx_payments_tenantId')
  tenantId!: number;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod?: PaymentMethod | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  failureReason?: string | null;

  @Column({ type: 'double precision', default: 0 })
  refundedAmount!: number;

  @Column({
    type: 'enum',
    enum: PaymentReconciliationStatus,
    default: PaymentReconciliationStatus.PENDING_REVIEW,
  })
  reconciliationStatus!: PaymentReconciliationStatus;

  @Column({ type: 'jsonb', nullable: true })
  reconciliationMetadata?: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  reconciledAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => RefundEntity, (r) => r.payment)
  refunds?: RefundEntity[];
}

@Entity('refunds')
@Index('refunds_paymentId_idx', ['paymentId'])
@Index('refunds_gatewayRefundId_idx', ['gatewayRefundId'])
export class RefundEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  paymentId!: string;
  @ManyToOne(() => PaymentEntity, (p) => p.refunds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentId' })
  payment?: PaymentEntity;

  @Column({ type: 'double precision' })
  amount!: number;

  @Column({ type: 'varchar', length: 8, default: 'INR' })
  currency!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  gatewayRefundId?: string | null;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('subscriptions')
@Index('subscriptions_userId_key', ['userId'], { unique: true })
@Index('subscriptions_userId_idx', ['userId'])
@Index('subscriptions_status_idx', ['status'])
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  userId!: number;
  @OneToOne(() => UserEntity, (u) => u.subscription)
  user?: UserEntity;

  @Column({ type: 'enum', enum: SubscriptionPlan, default: SubscriptionPlan.FREE })
  plan!: SubscriptionPlan;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status!: SubscriptionStatus;

  @Column({ type: 'enum', enum: PaymentGateway })
  gateway!: PaymentGateway;

  @Column({ type: 'varchar', length: 128, nullable: true })
  gatewaySubscriptionId?: string | null;

  @Column({ type: 'timestamp' })
  currentPeriodStart!: Date;

  @Column({ type: 'timestamp' })
  currentPeriodEnd!: Date;

  @Column({ type: 'boolean', default: false })
  cancelAtPeriodEnd!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  trialStart?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  trialEnd?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => InvoiceEntity, (i) => i.subscription)
  invoices?: InvoiceEntity[];
}

@Entity('invoices')
@Index('invoices_invoiceNumber_key', ['invoiceNumber'], { unique: true })
@Index('invoices_userId_idx', ['userId'])
@Index('invoices_subscriptionId_idx', ['subscriptionId'])
@Index('invoices_warehouseId_idx', ['warehouseId'])
@Index('invoices_sellerProfileId_idx', ['sellerProfileId'])
@Index('invoices_financialYear_warehouse_idx', ['financialYear', 'warehouseId'])
@Index('invoices_status_idx', ['status'])
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  invoiceNumber!: string;

  @Column({ type: 'uuid', nullable: true })
  subscriptionId?: string | null;
  @ManyToOne(() => SubscriptionEntity, (s) => s.invoices)
  @JoinColumn({ name: "subscriptionId" })
  subscription?: SubscriptionEntity | null;

  @Column({ type: 'int' })
  userId!: number;
  @ManyToOne(() => UserEntity, (u) => u.invoices)
  user?: UserEntity;

  @Column({ type: 'int', nullable: true })
  warehouseId?: number | null;
  @ManyToOne(() => WarehouseEntity, (w) => w.invoices)
  @JoinColumn({ name: "warehouseId" })
  warehouse?: WarehouseEntity | null;

  @Column({ type: 'int', nullable: true })
  sellerProfileId?: number | null;
  @ManyToOne(() => WarehouseSellerProfileEntity, (p) => p.invoices)
  @JoinColumn({ name: "sellerProfileId" })
  sellerProfile?: WarehouseSellerProfileEntity | null;

  @Column({ type: 'int', default: 1 })
  @Index('idx_invoices_tenantId')
  tenantId!: number;

  // Buyer
  @Column({ type: 'varchar', length: 128, nullable: true })
  buyerLegalName?: string | null;
  @Column({ type: 'varchar', length: 16, nullable: true })
  buyerGstin?: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true })
  buyerState?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  buyerEmail?: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true })
  buyerPhone?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  buyerAddressLine1?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  buyerAddressLine2?: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true })
  buyerCity?: string | null;
  @Column({ type: 'varchar', length: 16, nullable: true })
  buyerPincode?: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true })
  buyerCountry?: string | null;

  // Money
  @Column({ type: 'double precision' })
  amount!: number;
  @Column({ type: 'double precision', default: 0 })
  taxAmount!: number;
  @Column({ type: 'double precision', default: 0 })
  cgstAmount!: number;
  @Column({ type: 'double precision', default: 0 })
  sgstAmount!: number;
  @Column({ type: 'double precision', default: 0 })
  igstAmount!: number;
  @Column({ type: 'varchar', length: 16, nullable: true })
  gstType?: string | null;
  @Column({ type: 'double precision' })
  totalAmount!: number;
  @Column({ type: 'varchar', length: 8, default: 'INR' })
  currency!: string;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status!: InvoiceStatus;

  @Column({ type: 'int', nullable: true })
  sequenceNumber?: number | null;
  @Column({ type: 'varchar', length: 16, nullable: true })
  financialYear?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  dueDate?: Date | null;
  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date | null;

  // GSTN
  @Column({ type: 'text', nullable: true })
  invoiceUrl?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  pdfStorageKey?: string | null;
  @Column({ type: 'timestamp', nullable: true })
  pdfUploadedAt?: Date | null;
  @Column({ type: 'varchar', length: 64, nullable: true })
  gstnAckNumber?: string | null;
  @Column({ type: 'timestamp', nullable: true })
  gstnAckDate?: Date | null;
  @Column({ type: 'text', nullable: true })
  gstnSignedPayload?: string | null;
  @Column({ type: 'boolean', default: false })
  gstnSignatureValid!: boolean;

  // Email delivery
  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  emailDeliveryStatus!: string;
  @Column({ type: 'int', default: 0 })
  emailDeliveryAttempts!: number;
  @Column({ type: 'timestamp', nullable: true })
  emailDeliveredAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => InvoiceItemEntity, (i) => i.invoice)
  invoiceItems?: InvoiceItemEntity[];

  @OneToMany(() => PaymentEntity, (p) => p.invoice)
  payments?: PaymentEntity[];

  // Unidirectional OneToOne (no inverse lambda): EwayBillEntity exposes
  // `invoiceId` directly and has no `invoice` relation property.
  @OneToOne(() => EwayBillEntity)
  ewayBill?: EwayBillEntity | null;
}

@Entity('invoice_items')
@Index('invoice_items_invoiceId_idx', ['invoiceId'])
export class InvoiceItemEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'uuid' })
  invoiceId!: string;
  @ManyToOne(() => InvoiceEntity, (i) => i.invoiceItems, { onDelete: 'CASCADE' })
  invoice?: InvoiceEntity;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ type: 'double precision' })
  unitPrice!: number;

  @Column({ type: 'double precision' })
  totalPrice!: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  hsnCode?: string | null;

  @Column({ type: 'double precision', default: 0 })
  taxRate!: number;

  @Column({ type: 'double precision', default: 0 })
  taxAmount!: number;

  @Column({ type: 'double precision', default: 0 })
  cgstAmount!: number;

  @Column({ type: 'double precision', default: 0 })
  sgstAmount!: number;

  @Column({ type: 'double precision', default: 0 })
  igstAmount!: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  gstType?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}

/**
 * SS-033 — COD Remittance entity.
 *
 * One row per remittance advisory we ingest from a courier (Delhivery /
 * Xpressbees / Ecom Express / etc.) before we match it against our bank
 * statement. The lifecycle is `BankCodRemittanceStatus`:
 *
 *   PENDING → RECEIVED → RECONCILED          (happy path)
 *                └─→ DISPUTED → (resolved)  (mismatch path)
 *
 * `courierRef` is the courier's own reference (e.g. "DRL/2024-04/0042")
 * and is the primary join key for the bank-statement fuzzy match. It is
 * nullable because some courier APIs (e.g. legacy Ecom Express) only
 * include a batch ID; in that case `period` + `amount` are the join keys.
 *
 * Tenant scoping: the (tenantId, depositDate) index is what the
 * reconciliation cron walks; we never let a remittance cross tenants.
 *
 * Note: there is an unrelated `CodRemittanceEntity` in
 * `shipping.entities.ts` (per-order COD amount). The two serve
 * different aggregates — this one is the bank-reconciliation side
 * (courier batch, period, deposit date, dispute lifecycle). The
 * names are deliberately kept distinct to avoid ambiguity in
 * GraphQL types and database table names.
 */
@Entity('bank_cod_remittances')
@Index('bank_cod_remittances_tenant_deposit_idx', ['tenantId', 'depositDate'])
@Index('bank_cod_remittances_status_idx', ['status'])
@Index('bank_cod_remittances_courier_ref_idx', ['courier', 'courierRef'])
export class BankCodRemittanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  @Index('idx_cod_remittances_tenantId')
  tenantId!: number;

  /** Courier code/name, e.g. "DELHIVERY", "XPRESSBEES", "ECOM_EXPRESS". */
  @Column({ type: 'varchar', length: 64 })
  courier!: string;

  /** Remittance batch period, e.g. "2024-04-W1" or "2024-04-15". */
  @Column({ type: 'varchar', length: 32 })
  period!: string;

  /** Total amount the courier says it deposited for this period. */
  @Column({ type: 'double precision' })
  amount!: number;

  /** When the courier says the deposit was made. */
  @Column({ type: 'timestamp' })
  depositDate!: Date;

  /** Optional courier-side reference (used as fuzzy match key). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  courierRef?: string | null;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'RECEIVED', 'RECONCILED', 'DISPUTED'],
    default: 'PENDING',
  })
  status!: 'PENDING' | 'RECEIVED' | 'RECONCILED' | 'DISPUTED';

  /** Optional idempotency key — dedupes repeat ingests. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  externalId?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => BankCodDisputeEntity, (d) => d.codRemittance)
  disputes?: BankCodDisputeEntity[];
}

/**
 * SS-033 — COD Dispute entity.
 *
 * One row per remittance that could not be cleanly reconciled against
 * the bank statement. Created automatically by the reconciliation
 * engine when a `CodRemittanceEntity` is unmatched; staff then triage
 * it through the OPEN → UNDER_REVIEW → RESOLVED flow.
 *
 * `reason` is a short machine-readable tag (e.g. "AMOUNT_MISMATCH",
 * "DATE_OUT_OF_WINDOW", "NO_BANK_MATCH", "DUPLICATE_DEPOSIT"). The
 * `comments` field is free-form text the agent fills in.
 *
 * `evidenceUrl` points to a file in S3 — the bank statement excerpt
 * or a screenshot from the courier portal that supports the dispute.
 */
@Entity('bank_cod_disputes')
@Index('bank_cod_disputes_status_created_idx', ['status', 'createdAt'])
@Index('bank_cod_disputes_remittance_idx', ['codRemittanceId'])
export class BankCodDisputeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  codRemittanceId!: string;
  @ManyToOne(() => BankCodRemittanceEntity, (r) => r.disputes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'codRemittanceId' })
  codRemittance?: BankCodRemittanceEntity;

  @Column({ type: 'int' })
  @Index('idx_cod_disputes_tenantId')
  tenantId!: number;

  /** Short reason tag — see entity docstring for the canonical values. */
  @Column({ type: 'varchar', length: 64 })
  reason!: string;

  @Column({
    type: 'enum',
    enum: ['OPEN', 'UNDER_REVIEW', 'RESOLVED'],
    default: 'OPEN',
  })
  status!: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';

  /** URL to the supporting evidence file in S3 (or null if not yet uploaded). */
  @Column({ type: 'text', nullable: true })
  evidenceUrl?: string | null;

  /** Free-form agent notes. */
  @Column({ type: 'text', nullable: true })
  comments?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/**
 * String-literal lifecycle for `BankCodRemittanceEntity.status`.
 * Kept as a type alias (not an enum) so the value can be passed
 * straight into the Postgres enum column without a runtime import.
 */
export type BankCodRemittanceStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'RECONCILED'
  | 'DISPUTED';

/** String-literal lifecycle for `BankCodDisputeEntity.status`. */
export type BankCodDisputeStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'RESOLVED';
