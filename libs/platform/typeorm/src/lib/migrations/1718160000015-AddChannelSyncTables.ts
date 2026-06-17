import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SS-026 — AddChannelSyncTables1718160000014
 *
 * Creates the two tables that back the channel-agnostic ChannelSyncService:
 *
 *   - channel_connections — one row per (tenantId, platform, external-account).
 *     `credentials` is the AES-256-GCM encrypted JSON blob. `productCursor` /
 *     `orderCursor` are opaque platform-side pagination tokens advanced by
 *     each successful sync. Unique index on (tenantId, platform,
 *     externalAccountId) prevents duplicate connects.
 *
 *   - channel_sync_jobs — one row per sync attempt. `idempotencyKey` is the
 *     unique collapse key (`tenantId|channelId|type|window`) so a duplicate
 *     trigger within the same window returns the same row instead of
 *     double-running. `processedExternalIds` (jsonb) lists the order
 *     external ids that the orders sync touched — used by the orders lib
 *     to skip on retry.
 *
 * Indexes:
 *   - tenant-scoped list queries (channelConnections resolver)
 *   - (tenantId, platform) for "all my Shopify stores"
 *   - (tenantId, status) for the scheduler's `WHERE status='active'`
 *   - unique (tenantId, platform, externalAccountId) — anti-duplicate
 *   - unique idempotencyKey — collapse duplicate triggers
 *   - (tenantId, channelId) for sync history lookups
 *
 * Idempotent: skips CREATE TABLE if it already exists (e.g. dev synchronize
 * already created it).
 */
export class AddChannelSyncTables1718160000015 implements MigrationInterface {
  name = 'AddChannelSyncTables1718160000015';

  public async up(q: QueryRunner): Promise<void> {
    const connExists = await q.query(
      `SELECT 1 FROM pg_tables WHERE tablename = 'channel_connections'`,
    );
    if (connExists.length === 0) {
      await q.query(`
        CREATE TABLE channel_connections (
          id SERIAL PRIMARY KEY,
          "tenantId" INTEGER NOT NULL DEFAULT 1,
          platform VARCHAR(32) NOT NULL,
          "displayName" VARCHAR(255) NOT NULL,
          "externalAccountId" VARCHAR(512) NOT NULL,
          credentials TEXT NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'pending',
          "productCursor" TEXT,
          "orderCursor" TEXT,
          "lastProductSyncAt" TIMESTAMP,
          "lastOrderSyncAt" TIMESTAMP,
          "lastError" VARCHAR,
          settings JSONB,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT channel_connections_status_check
            CHECK (status IN ('pending','active','paused','error','disconnected'))
        );
      `);

      await q.query(
        `CREATE INDEX channel_connections_tenantId_idx ON channel_connections ("tenantId");`,
      );
      await q.query(
        `CREATE INDEX channel_connections_tenant_platform_idx ON channel_connections ("tenantId", platform);`,
      );
      await q.query(
        `CREATE INDEX channel_connections_tenant_status_idx ON channel_connections ("tenantId", status);`,
      );
      await q.query(
        `CREATE UNIQUE INDEX channel_connections_unique_account ON channel_connections ("tenantId", platform, "externalAccountId");`,
      );
    }

    const jobsExists = await q.query(
      `SELECT 1 FROM pg_tables WHERE tablename = 'channel_sync_jobs'`,
    );
    if (jobsExists.length === 0) {
      await q.query(`
        CREATE TABLE channel_sync_jobs (
          id SERIAL PRIMARY KEY,
          "tenantId" INTEGER NOT NULL DEFAULT 1,
          "channelId" INTEGER NOT NULL,
          type VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'queued',
          "idempotencyKey" VARCHAR(191) NOT NULL,
          "startedAt" TIMESTAMP,
          "finishedAt" TIMESTAMP,
          "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
          "itemsCreated" INTEGER NOT NULL DEFAULT 0,
          "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
          "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
          "itemsFailed" INTEGER NOT NULL DEFAULT 0,
          "errorMessage" TEXT,
          "processedExternalIds" JSONB,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT channel_sync_jobs_type_check
            CHECK (type IN ('products','orders')),
          CONSTRAINT channel_sync_jobs_status_check
            CHECK (status IN ('queued','running','success','partial','failed'))
        );
      `);

      await q.query(
        `CREATE INDEX channel_sync_jobs_tenant_channel_idx ON channel_sync_jobs ("tenantId", "channelId");`,
      );
      await q.query(
        `CREATE INDEX channel_sync_jobs_tenant_status_idx ON channel_sync_jobs ("tenantId", status);`,
      );
      await q.query(
        `CREATE UNIQUE INDEX channel_sync_jobs_idempotencyKey ON channel_sync_jobs ("idempotencyKey");`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS channel_sync_jobs;`);
    await q.query(`DROP TABLE IF EXISTS channel_connections;`);
  }
}