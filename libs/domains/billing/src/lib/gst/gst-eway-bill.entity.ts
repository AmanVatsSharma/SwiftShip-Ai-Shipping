/**
 * SS-032 — GST E-way Bill entity.
 *
 * E-way bill (eway_bill_no) is mandatory under GST law for movement of
 * goods with invoice value > Rs 50,000. We record the bill issued by
 * the configured provider (ClearTax by default — sandbox, swappable to
 * IRIS / Cygnet) and link it to the originating `shipments` row.
 *
 * Uniqueness is on `ewbNo` per tenant (a provider never re-uses a
 * number, but in dev the sandbox does, so we add tenantId to be safe).
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShipmentEntity } from '@swiftship/platform-typeorm';

export type GstEwayBillStatus = 'GENERATED' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'REJECTED';

@Entity('gst_eway_bills')
@Index('gst_eway_bills_ewbNo_key', ['ewbNo'], { unique: true })
@Index('gst_eway_bills_shipmentId_idx', ['shipmentId'])
@Index('gst_eway_bills_status_idx', ['status'])
export class GstEwayBillEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  shipmentId!: number;
  @ManyToOne(() => ShipmentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipmentId' })
  shipment?: ShipmentEntity;

  @Column({ type: 'int' })
  @Index('idx_gst_eway_bills_tenantId')
  tenantId!: number;

  /** Provider-issued E-way bill number. Unique across tenants. */
  @Column({ type: 'varchar', length: 32 })
  ewbNo!: string;

  /** Name of the adapter that issued the bill (cleartax-sandbox, iris, etc.). */
  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: GstEwayBillStatus;

  @Column({ type: 'timestamp' })
  validFrom!: Date;

  /** E-way bills are valid for the lesser of: distance-based, or 15 days. */
  @Column({ type: 'timestamp' })
  validTo!: Date;

  @Column({ type: 'varchar', length: 32, nullable: true })
  vehicleNo?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  transporterId?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  transporterName?: string | null;

  @Column({ type: 'text', nullable: true })
  ewayBillUrl?: string | null;

  /** Provider's reference id (for support / audit). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  providerRef?: string | null;

  /** Free-form payload from the provider (kept for audit / dispute). */
  @Column({ type: 'jsonb', nullable: true })
  providerPayload?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
