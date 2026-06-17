import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AuditActorType } from './audit-log.types';

/**
 * SS-028 — Audit log row.
 *
 * One row per audited mutation (refund, void, role change, key rotation,
 * channel disconnect, manual shipment cancel, etc.). The shape mirrors
 * what the compliance team needs to answer "who did what, when, from
 * where, on behalf of which tenant?" in a single SQL query.
 *
 *  - tenantId is denormalized so a single index covers the per-tenant
 *    feed (the most common access pattern).
 *  - correlationId indexes the same id the HTTP middleware writes to
 *    `X-Request-Id` — cross-referencing the audit row to the structured
 *    logs / OTel trace is a single equality predicate.
 *  - before / after are JSONB snapshots, not deltas. Storage is cheap
 *    and full snapshots survive schema changes in `resourceType`.
 *
 * Retention: 7 years for `actorType='user'` / `'api_key'`, 90 days for
 * `actorType='system'`. Enforced by the housekeeping cron in
 * `libs/domains/tenants/src/lib/audit/cron/audit-housekeeping.cron.ts`
 * (separate bead).
 */
@Entity('audit_logs')
@Index('idx_audit_logs_tenant_created', ['tenantId', 'createdAt'])
@Index('idx_audit_logs_resource', ['resourceType', 'resourceId'])
@Index('idx_audit_logs_correlation', ['correlationId'])
@Index('idx_audit_logs_actor', ['actorUserId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', nullable: true })
  tenantId!: number | null;

  @Column({ type: 'int', nullable: true })
  actorUserId!: number | null;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  actorType!: AuditActorType;

  @Column({ type: 'varchar', length: 128 })
  action!: string;

  @Column({ type: 'varchar', length: 64 })
  resourceType!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  resourceId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  beforeJson!: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterJson!: Record<string, any> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  correlationId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
