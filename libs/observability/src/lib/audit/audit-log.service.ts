import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './audit-log.entity';
import type { AuditEvent, AuditLogFilter } from './audit-log.types';
import { getCorrelationContext } from '../correlation/context';

/**
 * SS-028 — AuditLogService.
 *
 * The single write/read surface for the `audit_logs` table.
 *
 * `record()` is called by:
 *  - the `AuditInterceptor` (auto-records `@Mutation` resolver calls)
 *  - any service that needs a manual record (e.g. a webhook callback
 *    fires an async action that needs to be audit-logged from the
 *    worker, not from the resolver).
 *
 * `query()` / `getForResource()` are the read surfaces consumed by the
 * GraphQL resolver.
 *
 * The service is `@Injectable()` and lives in `@swiftship/observability`.
 * The actual TypeORM `Repository<AuditLogEntity>` is provided by
 * `TypeOrmModule.forFeature([AuditLogEntity])` registered in
 * `AuditLogModule`. If the entity has not been migrated yet (e.g. on
 * a fresh DB without `pnpm migration:run`), `record()` short-circuits
 * with a `console.warn` — the decorator must never crash a request.
 */
@Injectable()
export class AuditLogService {
  private readonly fallbackLog = new Logger('AuditLogService');

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  /**
   * Persist one audit row. If the repo is not available (e.g. the
   * migration has not run yet) this is a soft no-op: we log a warning
   * and return `null` so the calling resolver still completes.
   */
  async record(event: AuditEvent): Promise<AuditLogEntity | null> {
    if (!this.repo) {
      this.fallbackLog.warn(
        'AuditLogService.record called before AuditLogEntity was registered; dropping event',
      );
      return null;
    }
    const correlation = getCorrelationContext();
    const row = this.repo.create({
      tenantId: this.toInt(event.tenantId) ?? null,
      actorUserId: this.toInt(event.actorUserId) ?? null,
      actorType: event.actorType ?? 'user',
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId != null ? String(event.resourceId) : null,
      beforeJson: event.before ?? null,
      afterJson: event.after ?? null,
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
      correlationId: event.correlationId ?? correlation?.correlationId ?? null,
    });
    try {
      return await this.repo.save(row);
    } catch (err) {
      // Never let an audit failure break a request. Log and move on.
      // eslint-disable-next-line no-console
      console.warn(
        '[audit] record() failed; dropping event:',
        (err as Error).message,
        event.action,
      );
      return null;
    }
  }

  /**
   * Read audit rows for a tenant, with a simple filter and pagination.
   * Returns newest-first.
   */
  async query(filter: AuditLogFilter): Promise<AuditLogEntity[]> {
    const qb = this.repo.createQueryBuilder('a');
    if (filter.tenantId !== undefined) {
      qb.andWhere('a.tenantId = :tenantId', { tenantId: this.toInt(filter.tenantId) });
    }
    if (filter.actorUserId !== undefined) {
      qb.andWhere('a.actorUserId = :actorUserId', {
        actorUserId: this.toInt(filter.actorUserId),
      });
    }
    if (filter.action) {
      qb.andWhere('a.action = :action', { action: filter.action });
    }
    if (filter.resourceType) {
      qb.andWhere('a.resourceType = :resourceType', {
        resourceType: filter.resourceType,
      });
    }
    if (filter.resourceId !== undefined) {
      qb.andWhere('a.resourceId = :resourceId', {
        resourceId: String(filter.resourceId),
      });
    }
    if (filter.since) {
      qb.andWhere('a.createdAt >= :since', { since: filter.since });
    }
    if (filter.until) {
      qb.andWhere('a.createdAt <= :until', { until: filter.until });
    }
    qb.orderBy('a.createdAt', 'DESC');
    qb.take(Math.min(filter.limit ?? 50, 200));
    qb.skip(filter.offset ?? 0);
    return qb.getMany();
  }

  /**
   * Convenience: every audit row for a single resource, ordered
   * newest-first. Used by the GraphQL `resourceHistory` query.
   */
  async getForResource(
    tenantId: number | string,
    resourceType: string,
    resourceId: string | number,
  ): Promise<AuditLogEntity[]> {
    return this.query({ tenantId, resourceType, resourceId, limit: 200 });
  }

  private toInt(v: number | string | null | undefined): number | null {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
}
