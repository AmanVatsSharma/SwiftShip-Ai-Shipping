import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * CourierScoreDailyEntity
 *
 * Daily aggregated performance metrics per (carrier, zone, day). Populated
 * by the `courier-score-pull` worker which runs nightly at 02:00 and rolls
 * up the last 7 days of `ShipmentEntity` rows.
 *
 * Score is computed at read time by `CourierScoreService` from the
 * `delivered`, `onTime`, `ndr`, `rto`, `damaged`, `attempted` counts.
 *
 * Indexes:
 *  - `(carrierId, day)` for tenant-wide carrier trend queries
 *  - `(carrierId, zone, day)` for per-zone breakdowns
 *
 * Notes:
 *  - `tenantId` is the legacy "tenant" column. In this codebase, the closest
 *    equivalent is the `userId` on the owning `OrderEntity`, which we denormalise
 *    onto this table so we can roll up per-tenant scorecards without an extra
 *    join. Treat it as a soft-tenant identifier (scalar, indexed below).
 *  - `day` is stored as `YYYY-MM-DD` so we can group by day without timezone
 *    fuzziness; the worker slices the [start, end) window in UTC.
 */
@Entity('courier_score_daily')
@Index('idx_courier_score_carrier_day', ['carrierId', 'day'])
@Index('idx_courier_score_carrier_zone_day', ['carrierId', 'zone', 'day'])
export class CourierScoreDailyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int', default: 1 })
  @Index('idx_courier_score_tenant_day', ['tenantId', 'day'])
  tenantId!: number;

  @Column({ type: 'int' })
  carrierId!: number;

  @Column({ type: 'varchar', length: 64 })
  carrierCode!: string;

  /**
   * Pincode zone: 'A' | 'B' | 'C' | 'D' | 'E' | 'NE' | 'JK'. For shipments
   * whose destination pincode is unknown we store 'UNKNOWN'.
   */
  @Column({ type: 'varchar', length: 16 })
  zone!: string;

  /** YYYY-MM-DD (UTC) */
  @Column({ type: 'date' })
  day!: string;

  @Column({ type: 'int', default: 0 })
  delivered!: number;

  @Column({ type: 'int', default: 0 })
  onTime!: number;

  @Column({ type: 'int', default: 0 })
  ndr!: number;

  @Column({ type: 'int', default: 0 })
  rto!: number;

  @Column({ type: 'int', default: 0 })
  damaged!: number;

  @Column({ type: 'int', default: 0 })
  attempted!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
