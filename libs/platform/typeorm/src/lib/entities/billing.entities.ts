import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
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
  order?: OrderEntity | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  invoiceId?: string | null;
  @ManyToOne(() => InvoiceEntity, (i) => i.payments)
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

  @Column({ type: 'varchar', length: 64 })
  paymentId!: string;
  @ManyToOne(() => PaymentEntity, (p) => p.refunds, { onDelete: 'CASCADE' })
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

  @Column({ type: 'varchar', length: 64, nullable: true })
  subscriptionId?: string | null;
  @ManyToOne(() => SubscriptionEntity, (s) => s.invoices)
  subscription?: SubscriptionEntity | null;

  @Column({ type: 'int' })
  userId!: number;
  @ManyToOne(() => UserEntity, (u) => u.invoices)
  user?: UserEntity;

  @Column({ type: 'int', nullable: true })
  warehouseId?: number | null;
  @ManyToOne(() => WarehouseEntity, (w) => w.invoices)
  warehouse?: WarehouseEntity | null;

  @Column({ type: 'int', nullable: true })
  sellerProfileId?: number | null;
  @ManyToOne(() => WarehouseSellerProfileEntity, (p) => p.invoices)
  sellerProfile?: WarehouseSellerProfileEntity | null;

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

  @OneToOne(() => EwayBillEntity, (e) => e.invoice)
  ewayBill?: EwayBillEntity | null;
}

@Entity('invoice_items')
@Index('invoice_items_invoiceId_idx', ['invoiceId'])
export class InvoiceItemEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
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
