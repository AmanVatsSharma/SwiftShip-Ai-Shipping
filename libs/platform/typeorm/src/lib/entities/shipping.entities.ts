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
import { LabelStatus, ShipmentStatus } from '../enums';
import { OrderEntity } from './commerce.entities';
import { WarehouseEntity } from './warehouse.entities';

@Entity('carriers')
@Index('carriers_name_key', ['name'], { unique: true })
export class CarrierEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  apiKey!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ShippingRateEntity, (r) => r.carrier)
  shippingRates?: ShippingRateEntity[];

  @OneToMany(() => ShipmentEntity, (s) => s.carrier)
  shipments?: ShipmentEntity[];

  @OneToMany(() => PincodeZoneEntity, (p) => p.carrier)
  pincodeZones?: PincodeZoneEntity[];

  @OneToMany(() => RateSurchargeEntity, (r) => r.carrier)
  surcharges?: RateSurchargeEntity[];
}

@Entity('shipping_rates')
export class ShippingRateEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  carrierId!: number;
  @ManyToOne(() => CarrierEntity, (c) => c.shippingRates)
  carrier?: CarrierEntity;

  @Column({ type: 'varchar', length: 128 })
  serviceName!: string;

  @Column({ type: 'double precision' })
  rate!: number;

  @Column({ type: 'int' })
  estimatedDeliveryDays!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('shipments')
export class ShipmentEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  trackingNumber!: string;

  @Column({ type: 'enum', enum: ShipmentStatus })
  status!: ShipmentStatus;

  @Column({ type: 'int' })
  orderId!: number;
  @ManyToOne(() => OrderEntity, (o) => o.shipments)
  order?: OrderEntity;

  @Column({ type: 'int' })
  carrierId!: number;
  @ManyToOne(() => CarrierEntity, (c) => c.shipments)
  carrier?: CarrierEntity;

  @Column({ type: 'int', nullable: true })
  warehouseId?: number | null;
  @ManyToOne(() => WarehouseEntity, (w) => w.shipments)
  warehouse?: WarehouseEntity | null;

  @Column({ type: 'timestamp', nullable: true })
  shippedAt?: Date | null;
  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  originPincode?: string | null;
  @Column({ type: 'varchar', length: 16, nullable: true })
  destinationPincode?: string | null;
  @Column({ type: 'int', nullable: true })
  weightGrams?: number | null;
  @Column({ type: 'double precision', nullable: true })
  lengthCm?: number | null;
  @Column({ type: 'double precision', nullable: true })
  widthCm?: number | null;
  @Column({ type: 'double precision', nullable: true })
  heightCm?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToOne(() => ShippingLabelEntity, (l) => l.shipment)
  label?: ShippingLabelEntity | null;

  @OneToMany(() => TrackingEventEntity, (t) => t.shipment)
  trackingEvents?: TrackingEventEntity[];

  @OneToOne(() => PickupEntity, (p) => p.shipment)
  pickup?: PickupEntity | null;

  @OneToMany(() => ManifestItemEntity, (m) => m.shipment)
  manifestItems?: ManifestItemEntity[];

  @OneToOne(() => NdrCaseEntity, (n) => n.shipment)
  ndrCase?: NdrCaseEntity | null;

  @OneToOne(() => EwayBillEntity, (e) => e.shipment)
  ewayBill?: EwayBillEntity | null;
}

@Entity('shipping_labels')
@Index('shipping_labels_labelNumber_key', ['labelNumber'], { unique: true })
@Index('shipping_labels_shipmentId_key', ['shipmentId'], { unique: true })
export class ShippingLabelEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  shipmentId!: number;
  @OneToOne(() => ShipmentEntity, (s) => s.label)
  shipment?: ShipmentEntity;

  @Column({ type: 'varchar', length: 64 })
  labelNumber!: string;

  @Column({ type: 'varchar', length: 64 })
  carrierCode!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  serviceName?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  format?: string | null;

  @Column({ type: 'text', nullable: true })
  labelUrl?: string | null;

  @Column({ type: 'enum', enum: LabelStatus, default: LabelStatus.PENDING })
  status!: LabelStatus;

  @CreateDateColumn()
  requestedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  generatedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('tracking_events')
@Index('tracking_events_externalId_key', ['externalId'], { unique: true })
@Index('tracking_events_shipment_occurred_idx', ['shipmentId', 'occurredAt'])
export class TrackingEventEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  shipmentId!: number;
  @ManyToOne(() => ShipmentEntity, (s) => s.trackingEvents)
  shipment?: ShipmentEntity;

  @Column({ type: 'varchar', length: 64 })
  trackingNumber!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  externalId?: string | null;

  @Column({ type: 'varchar', length: 64 })
  status!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  subStatus?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  eventCode?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  location?: string | null;

  @Column({ type: 'timestamp' })
  occurredAt!: Date;

  @Column({ type: 'jsonb', nullable: true })
  raw?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('pincode_zones')
@Index('pincode_zones_pincode_key', ['pincode'], { unique: true })
export class PincodeZoneEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 16 })
  pincode!: string;

  @Column({ type: 'varchar', length: 16 })
  zone!: string;

  @Column({ type: 'boolean', default: false })
  oda!: boolean;

  @Column({ type: 'int', nullable: true })
  carrierId?: number | null;
  @ManyToOne(() => CarrierEntity, (c) => c.pincodeZones)
  carrier?: CarrierEntity | null;
}

@Entity('rate_surcharges')
export class RateSurchargeEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  carrierId!: number;
  @ManyToOne(() => CarrierEntity, (c) => c.surcharges)
  carrier?: CarrierEntity;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'double precision', nullable: true })
  percent?: number | null;

  @Column({ type: 'double precision', nullable: true })
  flat?: number | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('pickups')
@Index('pickups_shipmentId_key', ['shipmentId'], { unique: true })
export class PickupEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  shipmentId!: number;
  @OneToOne(() => ShipmentEntity, (s) => s.pickup)
  shipment?: ShipmentEntity;

  @Column({ type: 'timestamp' })
  scheduledAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt?: Date | null;

  @Column({ type: 'varchar', length: 32, default: 'SCHEDULED' })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('manifests')
@Index('manifests_manifestNo_key', ['manifestNo'], { unique: true })
export class ManifestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  manifestNo!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToMany(() => ManifestItemEntity, (m) => m.manifest)
  items?: ManifestItemEntity[];
}

@Entity('manifest_items')
@Index('manifest_items_manifest_shipment_key', ['manifestId', 'shipmentId'], { unique: true })
export class ManifestItemEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  manifestId!: number;
  @ManyToOne(() => ManifestEntity, (m) => m.items)
  manifest?: ManifestEntity;

  @Column({ type: 'int' })
  shipmentId!: number;
  @ManyToOne(() => ShipmentEntity, (s) => s.manifestItems)
  shipment?: ShipmentEntity;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('ndr_cases')
@Index('ndr_cases_shipmentId_key', ['shipmentId'], { unique: true })
export class NdrCaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  shipmentId!: number;
  @OneToOne(() => ShipmentEntity, (s) => s.ndrCase)
  shipment?: ShipmentEntity;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  actionNotes?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('cod_remittances')
@Index('cod_remittances_orderId_key', ['orderId'], { unique: true })
export class CodRemittanceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  orderId!: number;
  @OneToOne(() => OrderEntity, (o) => o.codRemittance)
  order?: OrderEntity;

  @Column({ type: 'double precision' })
  amount!: number;

  @Column({ type: 'timestamp', nullable: true })
  remittedAt?: Date | null;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  referenceId?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('idempotency_keys')
@Index('idempotency_keys_key_key', ['key'], { unique: true })
export class IdempotencyKeyEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 128 })
  key!: string;

  @Column({ type: 'varchar', length: 64 })
  scope!: string;

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('eway_bills')
@Index('eway_bills_shipmentId_key', ['shipmentId'], { unique: true })
@Index('eway_bills_invoiceId_key', ['invoiceId'], { unique: true })
@Index('eway_bills_ewayBillNumber_key', ['ewayBillNumber'], { unique: true })
@Index('eway_bills_status_idx', ['status'])
export class EwayBillEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  shipmentId!: number;
  @OneToOne(() => ShipmentEntity, (s) => s.ewayBill)
  shipment?: ShipmentEntity;

  @Column({ type: 'varchar', length: 64, nullable: true })
  invoiceId?: string | null;

  @Column({ type: 'varchar', length: 32 })
  ewayBillNumber!: string;

  @Column({ type: 'varchar', length: 16 })
  consignorGstin!: string;

  @Column({ type: 'varchar', length: 16 })
  consigneeGstin!: string;

  @Column({ type: 'varchar', length: 128 })
  placeOfDispatch!: string;

  @Column({ type: 'varchar', length: 128 })
  placeOfDelivery!: string;

  @Column({ type: 'double precision' })
  invoiceValue!: number;

  @Column({ type: 'varchar', length: 64 })
  invoiceNumber!: string;

  @Column({ type: 'timestamp' })
  invoiceDate!: Date;

  @Column({ type: 'varchar', length: 16 })
  hsnCode!: string;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  transporterId?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  vehicleNumber?: string | null;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'timestamp', nullable: true })
  validUntil?: Date | null;

  @Column({ type: 'text', nullable: true })
  ewayBillUrl?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  documentStorageKey?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ackNumber?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  ackDate?: Date | null;

  @Column({ type: 'text', nullable: true })
  signedPayload?: string | null;

  @Column({ type: 'boolean', default: false })
  signatureValidated!: boolean;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAttempt?: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastSyncErrorCode?: string | null;

  @Column({ type: 'text', nullable: true })
  lastSyncErrorMessage?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
