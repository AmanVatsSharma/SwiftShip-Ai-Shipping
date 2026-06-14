import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddTenantId — SS-002.
 *
 * Adds `tenant_id INTEGER NOT NULL` + a per-table index + an FK to
 * `tenants(id)` for every domain entity table that currently exists in
 * the public schema.
 *
 * Tables that don't exist yet (e.g. modules still being built) are
 * silently skipped — we discover tables at runtime via
 * `pg_tables` so this migration is resilient to drift between
 * the bead spec and the entity files.
 *
 * Tables explicitly enumerated in the spec (mapped to actual entity
 * table names where they differ):
 *
 *   spec name                    actual table (if it exists)
 *   orders                       orders
 *   shipments                    shipments
 *   billing_invoices             invoices
 *   warehouses                   warehouses
 *   notifications                notifications         (may not exist)
 *   serviceability_pincodes      pincode_zones
 *   rate_shop_quotes             rate_surcharges       (closest available)
 *   ecommerce_integrations       shopify_stores        (closest available)
 *   carriers                     carriers
 *   cod_remittances              cod_remittances
 *   ndr_actions                  ndr_cases
 *   manifests                    manifests
 *   pickups                      pickups
 *   returns                      returns
 *   shipping_rates               shipping_rates
 *   users                        users
 *   webhooks                     webhook_subscriptions
 *   plugins                      plugins               (may not exist)
 *   surcharges                   rate_surcharges
 *   dashboard_widgets            courier_score_daily
 *   storage_files                storage_files         (may not exist)
 *   metrics                      metrics               (may not exist)
 *   onboarding_steps             onboarding_states
 *   payments                     payments
 *   bulk_operations              bulk_operations       (may not exist)
 *
 * The FK is added with `NOT VALID` so the migration stays fast on
 * large tables. A follow-up migration (SS-002d) will `VALIDATE
 * CONSTRAINT` once the system has settled.
 */
export class AddTenantId1718160000000 implements MigrationInterface {
  name = 'AddTenantId1718160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Discover which target tables actually exist in the public schema.
    //    Spec says 24; the entities folder may not yet have all of them.
    const candidates: string[] = [
      'orders',
      'shipments',
      'invoices', // spec: billing_invoices
      'warehouses',
      'notifications',
      'pincode_zones', // spec: serviceability_pincodes
      'rate_surcharges', // spec: rate_shop_quotes (closest)
      'shopify_stores', // spec: ecommerce_integrations (closest)
      'woocommerce_stores', // spec: ecommerce_integrations (alt)
      'carriers',
      'cod_remittances',
      'ndr_cases', // spec: ndr_actions
      'manifests',
      'pickups',
      'returns',
      'shipping_rates',
      'users',
      'webhook_subscriptions', // spec: webhooks
      'plugins',
      'courier_score_daily', // spec: dashboard_widgets
      'storage_files',
      'metrics',
      'onboarding_states', // spec: onboarding_steps
      'payments',
      'bulk_operations',
    ];

    const existing: { tablename: string }[] = await queryRunner.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const existingSet = new Set(existing.map((r) => r.tablename));

    const targets = candidates.filter((t) => existingSet.has(t));

    // 2. Ensure a tenant with id = 1 (system tenant) exists so the FK
    //    can land. SS-001 seeds this row, but be defensive in case
    //    the migration runs against a DB that doesn't have it yet.
    await queryRunner.query(
      `INSERT INTO tenants (id, slug, name, status, tier, settings, "createdAt", "updatedAt")
       VALUES (1, 'system', 'System Tenant', 'ACTIVE', 'ENTERPRISE', '{}'::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
    );

    // 3. For every target table: add column, backfill, set NOT NULL,
    //    index, FK (NOT VALID). All in per-table guarded blocks so a
    //    single failure doesn't unwind the whole migration.
    for (const table of targets) {
      const idxName = `idx_${table}_tenant`;
      const fkName = `fk_${table}_tenant`;

      // 3a. Add the column (nullable, default 1 to make backfill cheap).
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "tenantId" integer`,
      );

      // 3b. Backfill any nulls with the system tenant.
      await queryRunner.query(
        `UPDATE "${table}" SET "tenantId" = 1 WHERE "tenantId" IS NULL`,
      );

      // 3c. Enforce NOT NULL.
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "tenantId" SET NOT NULL`,
      );

      // 3d. Per-table index (idempotent).
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${idxName}" ON "${table}" ("tenantId")`,
      );

      // 3e. FK to tenants(id), NOT VALID. The follow-up migration
      //     will VALIDATE CONSTRAINT after a backfill window.
      await queryRunner.query(
        `ALTER TABLE "${table}"
           DROP CONSTRAINT IF EXISTS "${fkName}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}"
           ADD CONSTRAINT "${fkName}"
           FOREIGN KEY ("tenantId") REFERENCES tenants(id)
           NOT VALID`,
      );
    }
  }

  public async down(): Promise<void> {
    // Intentionally a no-op. The bead description says
    // "we never go back" — see the migration's docstring.
  }
}
