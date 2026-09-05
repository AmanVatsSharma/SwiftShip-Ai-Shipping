import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { AuditLogService } from './audit-log.service';
import { AuditEventGql } from './audit-log.model';
import { AuditLogFilterInput } from './audit-log.input';

/**
 * SS-028 — Audit log GraphQL resolver.
 *
 * Two queries:
 *  - `auditEvents(tenantId, filter, limit, offset)` — paged per-tenant feed.
 *  - `resourceHistory(tenantId, resourceType, resourceId)` — every audit
 *    row for one resource, ordered newest-first (max 200).
 *
 * Auth is applied at the app layer (global JWT guard) — this resolver
 * lives in `@swiftship/observability` and may not depend on
 * `@swiftship/platform-auth` per the Nx layer rules.
 */
@Resolver(() => AuditEventGql)
export class AuditLogResolver {
  constructor(private readonly audit: AuditLogService) {}

  @Query(() => [AuditEventGql], { name: 'auditEvents' })
  async auditEvents(
    @Args('tenantId', { type: () => ID }) tenantId: string,
    @Args('filter', { type: () => AuditLogFilterInput, nullable: true })
    filter?: AuditLogFilterInput,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 })
    limit?: number,
    @Args('offset', { type: () => Int, nullable: true, defaultValue: 0 })
    offset?: number,
  ): Promise<AuditEventGql[]> {
    const rows = await this.audit.query({
      tenantId,
      ...(filter ?? {}),
      limit: limit ?? 50,
      offset: offset ?? 0,
    });
    return rows.map(this.toGql);
  }

  @Query(() => [AuditEventGql], { name: 'resourceHistory' })
  async resourceHistory(
    @Args('tenantId', { type: () => ID }) tenantId: string,
    @Args('resourceType') resourceType: string,
    @Args('resourceId') resourceId: string,
  ): Promise<AuditEventGql[]> {
    const rows = await this.audit.getForResource(
      tenantId,
      resourceType,
      resourceId,
    );
    return rows.map(this.toGql);
  }

  private toGql = (row: any): AuditEventGql => ({
    id: row.id,
    tenantId: row.tenantId ?? undefined,
    actorUserId: row.actorUserId ?? undefined,
    actorType: row.actorType,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId ?? undefined,
    before: row.beforeJson ? JSON.stringify(row.beforeJson) : undefined,
    after: row.afterJson ? JSON.stringify(row.afterJson) : undefined,
    ipAddress: row.ipAddress ?? undefined,
    userAgent: row.userAgent ?? undefined,
    correlationId: row.correlationId ?? undefined,
    createdAt: row.createdAt,
  });
}
