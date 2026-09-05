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
import {
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
  ShipmentStatus,
} from '../enums';
import { UserEntity } from './identity.entities';
import { CarrierEntity } from './shipping.entities';
import { WarehouseEntity } from './warehouse.entities';

/**
 * Order — a customer order. Owns shipping/destination data and reverse
 * relations to shipments, returns, payments, and COD remittance.
 */
@Entity('orders')
@Index('orders_orderNumber_key', ['orderNumber'], { unique: true })
export class OrderEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  orderNumber!: string;

  @Column({ type: 'double precision' })
  total!: number;

  @Column({ type: 'enum', enum: OrderStatus })
  status!: OrderStatus;

  /** Payment state for the order (PENDING/PAID/…) — surfaced on the
   *  GraphQL `Order` model and set to PENDING on create. */
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;

  @Column({ type: 'int', default: 1 })
  @Index('idx_orders_tenantId')
  tenantId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'int' })
  userId!: number;
  @ManyToOne(() => UserEntity, (u) => u.orders)
  user?: UserEntity;

  @Column({ type: 'int', nullable: true })
  carrierId?: number | null;
  @ManyToOne(() => CarrierEntity)
  @JoinColumn({ name: 'carrierId' })
  carrier?: CarrierEntity | null;

  @Column({ type: 'int', nullable: true })
  warehouseId?: number | null;
  @ManyToOne(() => WarehouseEntity, (w) => w.orders)
  @JoinColumn({ name: 'warehouseId' })
  warehouse?: WarehouseEntity | null;

  @OneToMany('ShipmentEntity', (s: any) => s.order)
  shipments?: any[];

  @OneToMany('ReturnEntity', (r: any) => r.order)
  returns?: any[];

  @OneToOne('CodRemittanceEntity', (c: any) => c.order)
  codRemittance?: any;

  @OneToMany('PaymentEntity', (p: any) => p.order)
  payments?: any[];

  // destination
  @Column({ type: 'varchar', length: 128, nullable: true })
  destinationName?: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true })
  destinationPhone?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  destinationAddressLine1?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  destinationAddressLine2?: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true })
  destinationCity?: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true })
  destinationState?: string | null;
  @Column({ type: 'varchar', length: 16, nullable: true })
  destinationPincode?: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true, default: 'India' })
  destinationCountry?: string | null;

  // package
  @Column({ type: 'int', nullable: true })
  packageWeightGrams?: number | null;
  @Column({ type: 'double precision', nullable: true })
  packageLengthCm?: number | null;
  @Column({ type: 'double precision', nullable: true })
  packageWidthCm?: number | null;
  @Column({ type: 'double precision', nullable: true })
  packageHeightCm?: number | null;
}

@Entity('returns')
@Index('returns_returnNumber_key', ['returnNumber'], { unique: true })
export class ReturnEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  returnNumber!: string;

  @Column({ type: 'enum', enum: ReturnStatus })
  status!: ReturnStatus;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'int', default: 1 })
  @Index('idx_returns_tenantId')
  tenantId!: number;

  @Column({ type: 'timestamp', nullable: true })
  pickupScheduledAt?: Date | null;

  @Column({ type: 'int' })
  orderId!: number;
  @ManyToOne(() => OrderEntity, (o) => o.returns)
  order?: OrderEntity;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

/** Re-export of ShipmentStatus for downstream imports of `commerce.entities`. */
export { ShipmentStatus };

/**
 * SS-015: OrderRateQuote — audit/analytics record of every ranked quote
 * that the rate-engine produced for an order at creation time.
 *
 * One row per ranked carrier (position 1 = the auto-picked winner). The
 * full `RankedRateQuote` payload is stashed in `fullQuote` so the merchant
 * can later replay the ranking, see what the runner-up would have cost, or
 * answer "why was this carrier picked for this order?".
 *
 * All money in paise (int) — never doubles.
 */
@Entity('order_rate_quotes')
@Index('order_rate_quotes_orderId_idx', ['orderId'])
@Index('order_rate_quotes_tenantId_idx', ['tenantId'])
export class OrderRateQuoteEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  orderId!: number;

  @ManyToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order?: OrderEntity;

  @Column({ type: 'int', default: 1 })
  tenantId!: number;

  @Column({ type: 'varchar', length: 64 })
  carrierCode!: string;

  // RateQuote.serviceType is a string union ('STANDARD' | 'EXPRESS' | 'SAME_DAY' | 'OVERNIGHT').
  // Persisted as varchar so the raw carrier label survives for audit and replay.
  @Column({ type: 'varchar', length: 32 })
  serviceType!: string;

  @Column({ type: 'int' })
  ratePaise!: number;

  @Column({ type: 'int' })
  etaDaysMin!: number;

  @Column({ type: 'int' })
  etaDaysMax!: number;

  /** 1 = the winner the auto-pick chose for this order. */
  @Column({ type: 'int' })
  position!: number;

  @Column({ type: 'double precision' })
  rankingScore!: number;

  @Column({ type: 'int' })
  effectiveCostPaise!: number;

  @Column({ type: 'int' })
  expectedRtoLossPaise!: number;

  /** The entire `RankedRateQuote` payload — for audit + replay. */
  @Column({ type: 'jsonb' })
  fullQuote!: Record<string, any>;

  @CreateDateColumn()
  rankedAt!: Date;
}
