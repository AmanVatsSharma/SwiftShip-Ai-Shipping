/**
 * SS-028 — Audit log types.
 *
 * The persistent record lives in `audit_logs` (see
 * `AddAuditLogTable1718160000014` migration). This file is the
 * cross-platform shape used by:
 *
 *  - the audit decorator / interceptor (input to `record(...)`).
 *  - the GraphQL resolver (output of `query(...)` / `getForResource(...)`).
 *  - `StructuredLogger.logAudit(event)` (one line per row, for Loki).
 *
 * Kept here in `@swiftship/observability` so the decorator can be
 * exported from a shared lib without dragging the audit resolver into
 * any domain that does not need it.
 */
export type AuditActorType = 'user' | 'api_key' | 'system';

export interface AuditEvent {
  tenantId?: number | string;
  actorUserId?: number | string | null;
  actorType?: AuditActorType;
  action: string;
  resourceType: string;
  resourceId?: string | number | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, any> | null;
}

export interface AuditLogFilter {
  tenantId?: number | string;
  actorUserId?: number | string;
  action?: string;
  resourceType?: string;
  resourceId?: string | number;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}
