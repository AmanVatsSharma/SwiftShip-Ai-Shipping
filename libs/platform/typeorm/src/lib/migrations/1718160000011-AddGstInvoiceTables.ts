import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SS-032 — AddGstInvoiceTables1718160000011
 *
 * Adds the two tables backing the GST module:
 *   - gst_invoices — one row per `invoices` row that has been split
 *                    into CGST/SGST/IGST components. FK to invoices.
 *   - gst_eway_bills — one row per shipment that has had an E-way
 *                      bill issued. FK to shipments, with
 *                      `ewb_no` UNIQUE per tenant so retries cannot
 *                      silently double-insert.
 *
 * Foreign keys use the `NOT VALID` + `VALIDATE CONSTRAINT` pattern from
 * SS-002d so the migration doesn't block on any pre-existing rows
 * introduced by auto-synchronize in dev mode. The validity check runs
 * once the FK is in place.
 *
 * Status enums are Postgres ENUMs so the values are constrained at
 * the storage layer; the TypeScript entity uses string literals.
 */
export class AddGstInvoiceTables1718160000011 implements MigrationInterface {
  name = 'AddGstInvoiceTables1718160000011';

  public async up(q: QueryRunner): Promise<void> {
    // ---- enum for gst_invoices.gstType -------------------------------
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gst_invoice_type') THEN
          CREATE TYPE gst_invoice_type AS ENUM ('CGST_SGST', 'IGST');
        END IF;
      END $$;
    `);

    // ---- enum for gst_eway_bills.status ------------------------------
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gst_eway_bill_status') THEN
          CREATE TYPE gst_eway_bill_status AS ENUM (
            'GENERATED', 'ACTIVE', 'CANCELLED', 'EXPIRED', 'REJECTED'
          );
        END IF;
      END $$;
    `);

    // ---- gst_invoices -------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS gst_invoices (
        id                  SERIAL PRIMARY KEY,
        "invoiceId"         VARCHAR(64) NOT NULL,
        "tenantId"          INTEGER NOT NULL,
        "hsnCode"           VARCHAR(16) NOT NULL,
        "supplyDescription" VARCHAR(255),
        "taxableValue"      DOUBLE PRECISION NOT NULL,
        "taxRate"           DOUBLE PRECISION NOT NULL,
        "cgstAmount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
        "sgstAmount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
        "igstAmount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
        "totalTax"          DOUBLE PRECISION NOT NULL,
        "totalAmount"       DOUBLE PRECISION NOT NULL,
        "gstType"           gst_invoice_type NOT NULL,
        "supplierState"     VARCHAR(64) NOT NULL,
        "placeOfSupply"     VARCHAR(64) NOT NULL,
        "supplierGstin"     VARCHAR(16),
        "recipientGstin"    VARCHAR(16),
        "isInterState"      BOOLEAN NOT NULL DEFAULT false,
        metadata            JSONB,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS gst_invoices_invoiceId_key
        ON gst_invoices ("invoiceId");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS gst_invoices_hsn_idx
        ON gst_invoices ("hsnCode");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_gst_invoices_tenantId
        ON gst_invoices ("tenantId");
    `);

    // ---- gst_eway_bills ----------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS gst_eway_bills (
        id                  SERIAL PRIMARY KEY,
        "shipmentId"        INTEGER NOT NULL,
        "tenantId"          INTEGER NOT NULL,
        "ewbNo"             VARCHAR(32) NOT NULL,
        provider            VARCHAR(64) NOT NULL,
        status              gst_eway_bill_status NOT NULL,
        "validFrom"         TIMESTAMP NOT NULL,
        "validTo"           TIMESTAMP NOT NULL,
        "vehicleNo"         VARCHAR(32),
        "transporterId"     VARCHAR(16),
        "transporterName"   VARCHAR(128),
        "ewayBillUrl"       TEXT,
        "providerRef"       VARCHAR(128),
        "providerPayload"   JSONB,
        "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS gst_eway_bills_ewbNo_key
        ON gst_eway_bills ("ewbNo");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS gst_eway_bills_shipmentId_idx
        ON gst_eway_bills ("shipmentId");
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS gst_eway_bills_status_idx
        ON gst_eway_bills (status);
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_gst_eway_bills_tenantId
        ON gst_eway_bills ("tenantId");
    `);

    // ---- FK: gst_invoices -> invoices (NOT VALID + VALIDATE) ---------
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_gst_invoices_invoice'
        ) THEN
          ALTER TABLE gst_invoices
            ADD CONSTRAINT fk_gst_invoices_invoice
            FOREIGN KEY ("invoiceId") REFERENCES invoices(id)
            ON DELETE CASCADE NOT VALID;
          ALTER TABLE gst_invoices VALIDATE CONSTRAINT fk_gst_invoices_invoice;
        END IF;
      END $$;
    `);

    // ---- FK: gst_eway_bills -> shipments (NOT VALID + VALIDATE) ------
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_gst_eway_bills_shipment'
        ) THEN
          ALTER TABLE gst_eway_bills
            ADD CONSTRAINT fk_gst_eway_bills_shipment
            FOREIGN KEY ("shipmentId") REFERENCES shipments(id)
            ON DELETE CASCADE NOT VALID;
          ALTER TABLE gst_eway_bills VALIDATE CONSTRAINT fk_gst_eway_bills_shipment;
        END IF;
      END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE gst_invoices DROP CONSTRAINT IF EXISTS fk_gst_invoices_invoice;`);
    await q.query(`ALTER TABLE gst_eway_bills DROP CONSTRAINT IF EXISTS fk_gst_eway_bills_shipment;`);
    await q.query(`DROP INDEX IF EXISTS idx_gst_eway_bills_tenantId;`);
    await q.query(`DROP INDEX IF EXISTS gst_eway_bills_status_idx;`);
    await q.query(`DROP INDEX IF EXISTS gst_eway_bills_shipmentId_idx;`);
    await q.query(`DROP INDEX IF EXISTS gst_eway_bills_ewbNo_key;`);
    await q.query(`DROP TABLE IF EXISTS gst_eway_bills;`);
    await q.query(`DROP INDEX IF EXISTS idx_gst_invoices_tenantId;`);
    await q.query(`DROP INDEX IF EXISTS gst_invoices_hsn_idx;`);
    await q.query(`DROP INDEX IF EXISTS gst_invoices_invoiceId_key;`);
    await q.query(`DROP TABLE IF EXISTS gst_invoices;`);
    await q.query(`DROP TYPE IF EXISTS gst_eway_bill_status;`);
    await q.query(`DROP TYPE IF EXISTS gst_invoice_type;`);
  }
}
