/**
 * SS-032 — GST Invoice entity.
 *
 * Stores the per-invoice GST breakdown that backs a SwiftShip invoice.
 * One row per invoice (`invoices` is the parent), with the HSN code, the
 * applicable tax rate, and the per-component tax (CGST / SGST / IGST).
 *
 * The relationship to `invoices` is one-to-one: an invoice either has
 * a GST breakdown or it does not. The E-way bill — when one is
 * required — lives in {@link GstEwayBillEntity}.
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InvoiceEntity } from '@swiftship/platform-typeorm';

export type GstType = 'CGST_SGST' | 'IGST';

@Entity('gst_invoices')
@Index('gst_invoices_invoiceId_key', ['invoiceId'], { unique: true })
@Index('gst_invoices_hsn_idx', ['hsnCode'])
export class GstInvoiceEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  invoiceId!: string;
  @OneToOne(() => InvoiceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoiceId' })
  invoice?: InvoiceEntity;

  @Column({ type: 'int' })
  @Index('idx_gst_invoices_tenantId')
  tenantId!: number;

  @Column({ type: 'varchar', length: 16 })
  hsnCode!: string;

  /** Description of the supply, e.g. "Courier services" or "Goods". */
  @Column({ type: 'varchar', length: 255, nullable: true })
  supplyDescription?: string | null;

  @Column({ type: 'double precision' })
  taxableValue!: number;

  /** Combined tax rate, e.g. 18 (for 18% GST). Stored as percent. */
  @Column({ type: 'double precision' })
  taxRate!: number;

  /** CGST component (intra-state half of the tax rate). */
  @Column({ type: 'double precision', default: 0 })
  cgstAmount!: number;

  /** SGST component (intra-state half of the tax rate). */
  @Column({ type: 'double precision', default: 0 })
  sgstAmount!: number;

  /** IGST component (inter-state full tax rate). */
  @Column({ type: 'double precision', default: 0 })
  igstAmount!: number;

  @Column({ type: 'double precision' })
  totalTax!: number;

  @Column({ type: 'double precision' })
  totalAmount!: number;

  @Column({ type: 'varchar', length: 16 })
  gstType!: GstType;

  @Column({ type: 'varchar', length: 64 })
  supplierState!: string;

  @Column({ type: 'varchar', length: 64 })
  placeOfSupply!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  supplierGstin?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  recipientGstin?: string | null;

  @Column({ type: 'boolean', default: false })
  isInterState!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
