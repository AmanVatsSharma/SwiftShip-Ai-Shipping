import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SS-028 — AddAuditLogTable1718160000014
 *
 * Adds the `audit_logs` table backing the per-tenant audit trail.
 *
 * Columns mirror `AuditLogEntity` (libs/observability/src/lib/audit/audit-log.entity.ts):
 *   id, tenantId, actorUserId, actorType, action, resourceType,
 *   resourceId, beforeJson, afterJson, ipAddress, userAgent,
 *   correlationId, createdAt.
 *
 * Indexes target the four access patterns:
 *   1. (tenantId, createdAt) DESC  — the per-tenant feed (most common).
 *   2. (resourceType, resourceId)  — `resourceHistory` query.
 *   3. (correlationId)             — jump from a request's X-Request-Id
 *                                   to every audit row + log line that
 *                                   touched the same flow.
 *   4. (actorUserId)               — "what did user X do this quarter?"
 *
 * No FK to tenants(id): audit rows must survive tenant deletion
 * (a 7-year retention row cannot be blocked by a 30-day delete cascade).
 * The `tenantId` is a plain INTEGER column with an index for lookups.
 *
 * `actorType` is a VARCHAR(16) with a CHECK constraint enforcing the
 * three allowed values — this is cheaper and easier to migrate than a
 * Postgres ENUM, and the application already enforces the union at the
 * TypeScript layer.
 *
 * Retention: 7 years for actorType IN ('user','api_key'), 90 days for
 * 'system'. Enforced by the housekeeping cron (separate bead); this
 * migration only creates the table.
 */
export class AddAuditLogTable1718160000014 implements MigrationInterface {
  name = 'AddAuditLogTable1718160000014';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id              SERIAL PRIMARY KEY,
        "tenantId"      INTEGER,
        "actorUserId"   INTEGER,
        "actorType"     VARCHAR(16) NOT NULL DEFAULT 'user'
                          CHECK ("actorType" IN ('user','api_key','system')),
        "action"        VARCHAR(128) NOT NULL,
        "resourceType"  VARCHAR(64) NOT NULL,
        "resourceId"    VARCHAR(128),
        "beforeJson"    JSONB,
        "afterJson"     JSONB,
        "ipAddress"     VARCHAR(64),
        "userAgent"     VARCHAR(256),
        "correlationId" VARCHAR(128),
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
        ON audit_logs ("tenantId", "createdAt" DESC);
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
        ON audit_logs ("resourceType", "resourceId");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation
        ON audit_logs ("correlationId");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
        ON audit_logs ("actorUserId");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action
        ON audit_logs ("action");
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_audit_logs_action;`);
    await q.query(`DROP INDEX IF EXISTS idx_audit_logs_actor;`);
    await q.query(`DROP INDEX IF EXISTS idx_audit_logs_correlation;`);
    await q.query(`DROP INDEX IF EXISTS idx_audit_logs_resource;`);
    await q.query(`DROP INDEX IF EXISTS idx_audit_logs_tenant_created;`);
    await q.query(`DROP TABLE IF EXISTS audit_logs;`);
  }
}
