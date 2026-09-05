import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SS-031 — AddKycTables1718160000010
 *
 * Adds the KYC (Know-Your-Customer) tables for Indian merchant onboarding.
 * Two tables:
 *   - kyc_records  — one row per (tenantId, submission). Stores PAN,
 *                    GSTIN, bank last 4, IFSC, status, timestamps.
 *   - kyc_documents — child rows for supporting documents uploaded to
 *                    S3 (PAN card image, GST certificate, bank
 *                    statement, cancelled cheque). The s3_key is a
 *                    pointer; bytes live in the configured storage
 *                    driver.
 *
 * Foreign keys use the `NOT VALID` + `VALIDATE CONSTRAINT` pattern from
 * SS-002d so a long-running rewrite of legacy data is not required to
 * ship. The unique constraint on (tenantId, createdAt) is implicit — a
 * tenant may submit KYC multiple times (re-submit after REJECTED).
 */
export class AddKycTables1718160000010 implements MigrationInterface {
  name = 'AddKycTables1718160000010';

  public async up(q: QueryRunner): Promise<void> {
    // ---- enum for status -----------------------------------------------
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_status') THEN
          CREATE TYPE kyc_status AS ENUM (
            'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'
          );
        END IF;
      END $$;
    `);

    // ---- enum for document type ----------------------------------------
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_document_type') THEN
          CREATE TYPE kyc_document_type AS ENUM (
            'PAN', 'GSTIN', 'BANK_STATEMENT', 'CANCELLED_CHEQUE'
          );
        END IF;
      END $$;
    `);

    // ---- kyc_records ---------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS kyc_records (
        id              SERIAL PRIMARY KEY,
        "tenantId"      INTEGER NOT NULL,
        "userId"        INTEGER,
        pan             VARCHAR(16) NOT NULL,
        gstin           VARCHAR(16) NOT NULL,
        "bankAccountLast4" VARCHAR(4) NOT NULL,
        ifsc            VARCHAR(11) NOT NULL,
        "accountHolderName" VARCHAR(128),
        status          kyc_status NOT NULL DEFAULT 'PENDING',
        "providerRef"   VARCHAR(128),
        "rejectionReason" TEXT,
        metadata        JSONB,
        "submittedAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "verifiedAt"    TIMESTAMP,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS kyc_records_tenantId_idx
        ON kyc_records ("tenantId");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS kyc_records_tenant_status_idx
        ON kyc_records ("tenantId", status);
    `);

    // ---- kyc_documents -------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS kyc_documents (
        id            SERIAL PRIMARY KEY,
        "kycRecordId" INTEGER NOT NULL,
        "docType"     kyc_document_type NOT NULL,
        "s3Key"       VARCHAR(512) NOT NULL,
        "contentType" VARCHAR(64),
        "sizeBytes"   INTEGER,
        "uploadedAt"  TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS kyc_documents_record_idx
        ON kyc_documents ("kycRecordId");
    `);

    // ---- foreign key: kyc_documents -> kyc_records ---------------------
    // NOT VALID + VALIDATE CONSTRAINT so the migration doesn't block on
    // any pre-existing rows from the auto-synchronize dev mode.
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fk_kyc_documents_kyc_record'
        ) THEN
          ALTER TABLE kyc_documents
            ADD CONSTRAINT fk_kyc_documents_kyc_record
            FOREIGN KEY ("kycRecordId") REFERENCES kyc_records(id)
            ON DELETE CASCADE NOT VALID;
          ALTER TABLE kyc_documents VALIDATE CONSTRAINT fk_kyc_documents_kyc_record;
        END IF;
      END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE kyc_documents DROP CONSTRAINT IF EXISTS fk_kyc_documents_kyc_record;`,
    );
    await q.query(`DROP INDEX IF EXISTS kyc_documents_record_idx;`);
    await q.query(`DROP TABLE IF EXISTS kyc_documents;`);
    await q.query(`DROP INDEX IF EXISTS kyc_records_tenant_status_idx;`);
    await q.query(`DROP INDEX IF EXISTS kyc_records_tenantId_idx;`);
    await q.query(`DROP TABLE IF EXISTS kyc_records;`);
    await q.query(`DROP TYPE IF EXISTS kyc_document_type;`);
    await q.query(`DROP TYPE IF EXISTS kyc_status;`);
  }
}
