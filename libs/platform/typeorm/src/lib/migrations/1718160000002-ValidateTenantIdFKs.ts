import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ValidateTenantIdFKs — SS-002d.
 *
 * Follow-up to SS-002 (AddTenantId). The original migration added
 * `tenant_id` columns + FKs to 25 tables, and the FKs were created
 * as `NOT VALID` so the migration stayed fast on hot production
 * tables (especially `orders`, which can be millions of rows).
 *
 *  - New INSERTs/UPDATEs that violate the FK are rejected immediately.
 *  - Existing rows that violate the FK were NOT scanned.
 *
 * The data is now consistent (every row was backfilled to `tenant_id=1`
 * in SS-002, and SS-002b/SS-002c close off any future orphan writes),
 * so we can safely run `VALIDATE CONSTRAINT` to confirm the existing
 * rows satisfy the constraint and flip the constraint from
 * `NOT VALID` → `VALIDATED`.
 *
 * Locking
 * -------
 * `ALTER TABLE ... VALIDATE CONSTRAINT` takes a `ShareUpdateExclusiveLock`
 * (not `AccessExclusiveLock`). Reads + writes to the table continue
 * normally; the validate is essentially a full-table scan of the
 * constrained column.
 *
 * What is NOT validated here
 * --------------------------
 * - Wallet tables (`wallets`, `wallet_ledger`) — these were created
 *   fresh in SS-004b with `NOT VALID` FKs. Wallet data is append-only
 *   and self-consistent (the unique idempotency_key on the ledger is
 *   the actual correctness story for the wallet), so we leave those
 *   FKs as `NOT VALID` permanently.
 * - The `tenants` self-reference — SS-002 did not add a tenant FK
 *   to the `tenants` table itself (a row's `tenantId` references
 *   its own id, but a tenant has no `tenantId` column).
 */
export class ValidateTenantIdFKs1718160000002 implements MigrationInterface {
  name = 'ValidateTenantIdFKs1718160000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 25 tables from SS-002, with their FK names. The constraint naming
    // convention used in the SS-002 migration is `fk_<table>_tenant`
    // (the spec called these `fk_<table>_tenant_id` but the actual
    // SS-002 migration that shipped uses the shorter form).
    const targets: string[] = [
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

    // Discover which target tables actually exist in the public schema.
    // SS-002 only added tenantId to tables that existed at the time, so
    // some candidates here may not have a constraint to validate. We
    // skip silently (the SS-002 migration was also resilient to drift).
    const existing: { tablename: string }[] = await queryRunner.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const existingSet = new Set(existing.map((r) => r.tablename));

    for (const table of targets) {
      if (!existingSet.has(table)) {
        // Table wasn't present when SS-002 ran — nothing to validate.
        continue;
      }

      const fkName = `fk_${table}_tenant`;

      // Check the constraint exists and is currently NOT VALID. We
      // only need to call VALIDATE CONSTRAINT on the ones that are
      // actually NOT VALIDATED yet. (Once a constraint is validated,
      // re-running VALIDATE CONSTRAINT is a cheap no-op, but skipping
      // it is also fine.)
      const constraintRows: { convalidated: boolean }[] =
        await queryRunner.query(
          `SELECT convalidated
             FROM pg_constraint
            WHERE conname = $1
              AND conrelid = $2::regclass`,
          [fkName, table],
        );

      if (constraintRows.length === 0) {
        // Constraint doesn't exist on this table — SS-002 didn't add
        // one. Skip silently (the SS-002 migration only created FKs
        // on tables whose tenantId column it actually added).
        continue;
      }

      if (constraintRows[0].convalidated) {
        // Already validated by a previous run of this migration (or
        // an out-of-band operator action). Nothing to do.
        continue;
      }

      // The actual work. ShareUpdateExclusiveLock — reads + writes
      // to the table are not blocked; the validate just scans the
      // column and confirms every existing row satisfies the FK.
      await queryRunner.query(
        `ALTER TABLE "${table}" VALIDATE CONSTRAINT "${fkName}"`,
      );
    }
  }

  public async down(): Promise<void> {
    // No-op. `VALIDATE CONSTRAINT` cannot be rolled back — it just
    // flips a flag in pg_constraint. The constraint was already
    // enforcing for new rows the moment it was added in SS-002; the
    // validate only confirms existing rows. Rolling back would just
    // mark the constraint NOT VALID again, which has no effect on
    // data integrity (the FK still rejects new orphan writes either
    // way). We deliberately do NOT mark NOT VALID here so this
    // migration is idempotent in the obvious way.
  }
}
