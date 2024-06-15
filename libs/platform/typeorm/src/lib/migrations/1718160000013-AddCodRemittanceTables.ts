import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SS-033 — AddCodRemittanceTables1718160000013
 *
 * Adds the two tables backing the COD remittance / bank
 * reconciliation / dispute-queue subsystem:
 *
 *   - cod_remittances  — one row per courier-reported remittance
 *                        advisory (Delhivery / Xpressbees / etc.).
 *                        Index on (tenantId, depositDate) because
 *                        that's how the daily cron walks them.
 *
 *   - cod_disputes     — one row per remittance the reconciliation
 *                        engine could not match against a bank
 *                        transaction. Index on (status, createdAt)
 *                        because the support dashboard shows
 *                        "Open → Newest first" by default.
 *
 * Both enums are Postgres ENUMs (so the values are constrained at
 * the storage layer); the TypeScript entities reference them with
 * string literals and a `type: 'enum'` column.
 *
 * Foreign keys use the `NOT VALID` + `VALIDATE CONSTRAINT` pattern
 * from SS-002d so the migration doesn't block on pre-existing rows
 * introduced by auto-synchronize in dev mode. The validity check
 * runs once the FK is in place.
 */
export class AddCodRemittanceTables1718160000013 implements MigrationInterface {
  name = 'AddCodRemittanceTables1718160000013';

  public async up(q: QueryRunner): Promise<void> {
    // ---- enum for bank_cod_remittances.status -------------------------
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bank_cod_remittance_status') THEN
          CREATE TYPE bank_cod_remittance_status AS ENUM (
            'PENDING', 'RECEIVED', 'RECONCILED', 'DISPUTED'
          );
        END IF;
      END $$;
    `);

    // ---- enum for bank_cod_disputes.status ----------------------------
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bank_cod_dispute_status') THEN
          CREATE TYPE bank_cod_dispute_status AS ENUM (
            'OPEN', 'UNDER_REVIEW', 'RESOLVED'
          );
        END IF;
      END $$;
    `);

    // ---- bank_cod_remittances -----------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS bank_cod_remittances (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"      INTEGER NOT NULL,
        courier         VARCHAR(64) NOT NULL,
        period          VARCHAR(32) NOT NULL,
        amount          DOUBLE PRECISION NOT NULL,
        "depositDate"   TIMESTAMP NOT NULL,
        "courierRef"    VARCHAR(128),
        status          bank_cod_remittance_status NOT NULL DEFAULT 'PENDING',
        "externalId"    VARCHAR(128),
        metadata        JSONB,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS bank_cod_remittances_tenant_deposit_idx
        ON bank_cod_remittances ("tenantId", "depositDate");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS bank_cod_remittances_status_idx
        ON bank_cod_remittances (status);
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS bank_cod_remittances_courier_ref_idx
        ON bank_cod_remittances (courier, "courierRef");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_bank_cod_remittances_tenantId
        ON bank_cod_remittances ("tenantId");
    `);

    // ---- bank_cod_disputes --------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS bank_cod_disputes (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "codRemittanceId"   UUID NOT NULL,
        "tenantId"          INTEGER NOT NULL,
        reason              VARCHAR(64) NOT NULL,
        status              bank_cod_dispute_status NOT NULL DEFAULT 'OPEN',
        "evidenceUrl"       TEXT,
        comments            TEXT,
        metadata            JSONB,
        "resolvedAt"        TIMESTAMP,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS bank_cod_disputes_status_created_idx
        ON bank_cod_disputes (status, "createdAt");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS bank_cod_disputes_remittance_idx
        ON bank_cod_disputes ("codRemittanceId");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_bank_cod_disputes_tenantId
        ON bank_cod_disputes ("tenantId");
    `);

    // ---- FK: bank_cod_disputes -> bank_cod_remittances ---------------
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_bank_cod_disputes_remittance'
        ) THEN
          ALTER TABLE bank_cod_disputes
            ADD CONSTRAINT fk_bank_cod_disputes_remittance
            FOREIGN KEY ("codRemittanceId") REFERENCES bank_cod_remittances(id)
            ON DELETE CASCADE NOT VALID;
          ALTER TABLE bank_cod_disputes VALIDATE CONSTRAINT fk_bank_cod_disputes_remittance;
        END IF;
      END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE bank_cod_disputes DROP CONSTRAINT IF EXISTS fk_bank_cod_disputes_remittance;`);
    await q.query(`DROP INDEX IF EXISTS idx_bank_cod_disputes_tenantId;`);
    await q.query(`DROP INDEX IF EXISTS bank_cod_disputes_remittance_idx;`);
    await q.query(`DROP INDEX IF EXISTS bank_cod_disputes_status_created_idx;`);
    await q.query(`DROP TABLE IF EXISTS bank_cod_disputes;`);
    await q.query(`DROP INDEX IF EXISTS idx_bank_cod_remittances_tenantId;`);
    await q.query(`DROP INDEX IF EXISTS bank_cod_remittances_courier_ref_idx;`);
    await q.query(`DROP INDEX IF EXISTS bank_cod_remittances_status_idx;`);
    await q.query(`DROP INDEX IF EXISTS bank_cod_remittances_tenant_deposit_idx;`);
    await q.query(`DROP TABLE IF EXISTS bank_cod_remittances;`);
    await q.query(`DROP TYPE IF EXISTS bank_cod_dispute_status;`);
    await q.query(`DROP TYPE IF EXISTS bank_cod_remittance_status;`);
  }
}
