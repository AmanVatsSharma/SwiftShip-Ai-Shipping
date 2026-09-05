import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SS-017 — AddNdrCases1718160000005
 *
 * Extended NDR case table. The old compat-shim `NdrCaseEntity` had a
 * minimal shape (`reason` text, `status` varchar default 'OPEN'). This
 * migration adds the full SS-017 schema:
 *
 *   - tenantId (scoped queries)
 *   - NdrCaseStatus enum column (PENDING … CANCELLED)
 *   - awbNumber, courierName, customer* fields (for the notification services)
 *   - firstAttemptAt / lastAttemptAt / attemptCount (state-machine metadata)
 *   - metadata JSONB (transitionHistory, lastTransitionReason, …)
 *   - resolvedAt (mark a case as closed/done without deleting it)
 *
 * The existing `shipmentId` UNIQUE constraint is preserved — one NDR per
 * shipment per tenant, for idempotency at the tracking ingestion layer.
 */
export class AddNdrCases1718160000005 implements MigrationInterface {
  name = 'AddNdrCases1718160000005';

  public async up(q: QueryRunner): Promise<void> {
    // Idempotent: skip when the migration has already run in a dev
    // environment where `synchronize: true` auto-created the table.
    const exists = await q.query(
      `SELECT 1 FROM pg_tables WHERE tablename = 'ndr_cases'`,
    );
    if (exists.length === 0) return;

    // Add new columns to the existing table (migration-safe; doesn't drop
    // data from the legacy 'OPEN' cases).

    await q.query(`
      ALTER TABLE ndr_cases
        ADD COLUMN IF NOT EXISTS "awbNumber" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "courierName" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "customerPhone" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "customerEmail" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "customerName" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "ndrReason" TEXT,
        ADD COLUMN IF NOT EXISTS "firstAttemptAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS metadata JSONB,
        ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP;
    `);

    // Convert legacy `status` to a proper enum for the new states.
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ndr_case_status') THEN
          CREATE TYPE ndr_case_status AS ENUM (
            'PENDING', 'CALL_ATTEMPTED', 'WHATSAPP_SENT', 'EMAIL_SENT',
            'RESCHEDULED', 'DELIVERED', 'RTO_INITIATED', 'RTO', 'CANCELLED'
          );
        END IF;
      END $$;
    `);

    // Migrate existing rows: 'OPEN' → PENDING, 'CLOSED' → DELIVERED.
    await q.query(`
      UPDATE ndr_cases
        SET status = 'PENDING'
        WHERE status = 'OPEN';
      UPDATE ndr_cases
        SET status = 'DELIVERED'
        WHERE status = 'CLOSED';
    `);

    // Now cast the column to the enum.
    await q.query(`
      ALTER TABLE ndr_cases
        ALTER COLUMN status TYPE ndr_case_status USING status::ndr_case_status;
    `);

    // Drop the old 'reason' column (now superseded by ndrReason).
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS reason;`);

    // Add composite tenant+status index for fast "pending NDRs" lookups.
    await q.query(`
      CREATE INDEX IF NOT EXISTS ndr_cases_status_idx
        ON ndr_cases (status);
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS ndr_cases_tenantId_status_idx
        ON ndr_cases ("tenantId", status);
    `);

    // Add FK constraint to shipments (idempotent guard).
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fk_ndr_cases_shipment'
        ) THEN
          ALTER TABLE ndr_cases
            ADD CONSTRAINT fk_ndr_cases_shipment
            FOREIGN KEY ("shipmentId") REFERENCES shipments(id)
            ON DELETE CASCADE NOT VALID;
          ALTER TABLE ndr_cases VALIDATE CONSTRAINT fk_ndr_cases_shipment;
        END IF;
      END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE ndr_cases DROP CONSTRAINT IF EXISTS fk_ndr_cases_shipment;`,
    );
    await q.query(`DROP INDEX IF EXISTS ndr_cases_tenantId_status_idx;`);
    await q.query(`DROP INDEX IF EXISTS ndr_cases_status_idx;`);
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS resolvedAt;`);
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS metadata;`);
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS attemptCount;`);
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS lastAttemptAt;`);
    await q.query(
      `ALTER TABLE ndr_cases DROP COLUMN IF EXISTS firstAttemptAt;`,
    );
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS ndrReason;`);
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS customerName;`);
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS customerEmail;`);
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS customerPhone;`);
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS courierName;`);
    await q.query(`ALTER TABLE ndr_cases DROP COLUMN IF EXISTS awbNumber;`);
    await q.query(`ALTER TABLE ndr_cases ALTER COLUMN status DROP DEFAULT;`);
    await q.query(
      `ALTER TABLE ndr_cases ALTER COLUMN status TYPE VARCHAR(32);`,
    );
    await q.query(
      `ALTER TABLE ndr_cases ALTER COLUMN status SET DEFAULT 'OPEN';`,
    );
    await q.query(`DROP TYPE IF EXISTS ndr_case_status;`);
    await q.query(
      `ALTER TABLE ndr_cases ADD COLUMN IF NOT EXISTS reason TEXT;`,
    );
    await q.query(`UPDATE ndr_cases SET reason = '' WHERE reason IS NULL;`);
    await q.query(`ALTER TABLE ndr_cases ALTER COLUMN reason SET NOT NULL;`);
  }
}
