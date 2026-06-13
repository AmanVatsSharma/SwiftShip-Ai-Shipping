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
import { OrderStatus, ReturnStatus, ShipmentStatus } from '../enums';
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
  carrier?: CarrierEntity | null;

  @Column({ type: 'int', nullable: true })
  warehouseId?: number | null;
  @ManyToOne(() => WarehouseEntity, (w) => w.orders)
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
