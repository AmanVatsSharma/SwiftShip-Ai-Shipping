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
import { UserEntity } from './identity.entities';

@Entity('warehouses')
@Index('warehouses_code_key', ['code'], { unique: true })
export class WarehouseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  addressLine1!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  addressLine2?: string | null;

  @Column({ type: 'varchar', length: 64 })
  city!: string;

  @Column({ type: 'varchar', length: 64 })
  state!: string;

  @Column({ type: 'varchar', length: 16 })
  pincode!: string;

  @Column({ type: 'varchar', length: 64, default: 'India' })
  country!: string;

  @Column({ type: 'double precision', nullable: true })
  latitude?: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude?: number | null;

  @Column({ type: 'double precision', nullable: true })
  capacityCbm?: number | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 1 })
  @Index('idx_warehouses_tenantId')
  tenantId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => OrderEntity, (o) => o.warehouse)
  orders?: any[];

  @OneToMany(() => ShipmentEntity, (s) => s.warehouse)
  shipments?: any[];

  @OneToMany(() => WarehouseStockEntity, (s) => s.warehouse)
  stocks?: WarehouseStockEntity[];

  @OneToMany(() => WarehouseCoverageEntity, (c) => c.warehouse)
  coverages?: WarehouseCoverageEntity[];

  @OneToMany(() => WarehouseSellerProfileEntity, (p) => p.warehouse)
  sellerProfiles?: WarehouseSellerProfileEntity[];

  @OneToMany(() => InvoiceEntity, (i) => i.warehouse)
  invoices?: any[];

  @OneToMany(() => InvoiceSequenceEntity, (s) => s.warehouse)
  invoiceSequences?: InvoiceSequenceEntity[];
}

@Entity('warehouse_stocks')
@Index('warehouse_stocks_warehouseId_idx', ['warehouseId'])
@Index('warehouse_stocks_sku_idx', ['sku'])
export class WarehouseStockEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  warehouseId!: number;
  @ManyToOne(() => WarehouseEntity, (w) => w.stocks, { onDelete: 'CASCADE' })
  warehouse?: WarehouseEntity;

  @Column({ type: 'varchar', length: 128 })
  sku!: string;

  @Column({ type: 'int', default: 0 })
  quantity!: number;

  @Column({ type: 'int', nullable: true })
  reorderLevel?: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('warehouse_coverage')
@Index('warehouse_coverage_warehouse_pincode_key', ['warehouseId', 'pincode'], {
  unique: true,
})
@Index('warehouse_coverage_warehouse_pincode_idx', ['warehouseId', 'pincode'])
export class WarehouseCoverageEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  warehouseId!: number;
  @ManyToOne(() => WarehouseEntity, (w) => w.coverages, { onDelete: 'CASCADE' })
  warehouse?: WarehouseEntity;

  @Column({ type: 'varchar', length: 16 })
  pincode!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  serviceLevel?: string | null;

  @Column({ type: 'int', nullable: true })
  tatDays?: number | null;

  @Column({ type: 'boolean', default: false })
  isOda!: boolean;

  @Column({ type: 'double precision', nullable: true })
  odaFee?: number | null;

  @Column({ type: 'int', nullable: true })
  minWeightGrams?: number | null;

  @Column({ type: 'int', nullable: true })
  maxWeightGrams?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('warehouse_seller_profiles')
@Index('warehouse_seller_profiles_warehouse_user_idx', [
  'warehouseId',
  'userId',
])
@Index('warehouse_seller_profiles_warehouse_idx', ['warehouseId'])
@Index('warehouse_seller_profiles_warehouse_active_idx', [
  'warehouseId',
  'isActive',
])
export class WarehouseSellerProfileEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  warehouseId!: number;
  @ManyToOne(() => WarehouseEntity, (w) => w.sellerProfiles, {
    onDelete: 'CASCADE',
  })
  warehouse?: WarehouseEntity;

  @Column({ type: 'int' })
  userId!: number;
  @ManyToOne(() => UserEntity, (u) => u.sellerProfiles)
  user?: UserEntity;

  @Column({ type: 'varchar', length: 128 })
  profileName!: string;

  @Column({ type: 'varchar', length: 128 })
  legalName!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  displayName?: string | null;

  @Column({ type: 'varchar', length: 16 })
  gstin!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  pan?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  tan?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  cin?: string | null;

  @Column({ type: 'varchar', length: 255 })
  addressLine1!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  addressLine2?: string | null;

  @Column({ type: 'varchar', length: 64 })
  city!: string;

  @Column({ type: 'varchar', length: 64 })
  state!: string;

  @Column({ type: 'varchar', length: 16 })
  pincode!: string;

  @Column({ type: 'varchar', length: 64, default: 'India' })
  country!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  bankAccountNumber?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  bankIfsc?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  bankName?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  bankBranch?: string | null;

  @Column({ type: 'text', nullable: true })
  logoUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  signatureUrl?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', default: 'now()' })
  validFrom!: Date;

  @Column({ type: 'timestamp', nullable: true })
  validTo?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => InvoiceEntity, (i) => i.sellerProfile)
  invoices?: any[];
}

@Entity('invoice_sequences')
@Index(
  'invoice_sequences_warehouse_financialYear_key',
  ['warehouseId', 'financialYear'],
  { unique: true },
)
export class InvoiceSequenceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  warehouseId!: number;
  @ManyToOne(() => WarehouseEntity, (w) => w.invoiceSequences, {
    onDelete: 'CASCADE',
  })
  warehouse?: WarehouseEntity;

  @Column({ type: 'varchar', length: 16 })
  financialYear!: string;

  @Column({ type: 'int', default: 0 })
  lastSequence!: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  prefix?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

// Forward imports
import { OrderEntity } from './commerce.entities';
import { ShipmentEntity } from './shipping.entities';
import { InvoiceEntity } from './billing.entities';
