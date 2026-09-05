import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SS-019 — AddRtoDisputes1718160000006
 *
 * Creates the `rto_disputes` table for the merchant RTO dispute queue.
 * The RtoSettlementService writes one row per RTO shipment (status='OPEN')
 * and admins resolve them via the GraphQL surface, either crediting the
 * merchant (CARRIER_FAULT) or rejecting the dispute (MERCHANT_FAULT).
 *
 * Indexes:
 *   - shipmentId — for "disputes for this shipment" lookups
 *   - tenantId — for tenant-scoped lists (the dispute queue in the admin portal)
 *   - status — for "all OPEN disputes" queue pulls
 *
 * Idempotent: if the table already exists (e.g. synchronize=true created it
 * in dev) we skip the CREATE TABLE.
 */
export class AddRtoDisputes1718160000006 implements MigrationInterface {
  name = 'AddRtoDisputes1718160000006';

  public async up(q: QueryRunner): Promise<void> {
    const exists = await q.query(
      `SELECT 1 FROM pg_tables WHERE tablename = 'rto_disputes'`,
    );
    if (exists.length > 0) return;

    await q.query(`
      CREATE TABLE rto_disputes (
        id SERIAL PRIMARY KEY,
        "shipmentId" INTEGER NOT NULL,
        "orderId" INTEGER NOT NULL,
        "tenantId" INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        "reasonCode" VARCHAR(64),
        "merchantNotes" TEXT,
        resolution TEXT,
        "resolvedByUserId" INTEGER,
        "refundedPaise" INTEGER,
        "openedAt" TIMESTAMP,
        "resolvedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await q.query(
      `CREATE INDEX rto_disputes_shipmentId_idx ON rto_disputes ("shipmentId");`,
    );
    await q.query(
      `CREATE INDEX rto_disputes_tenantId_idx ON rto_disputes ("tenantId");`,
    );
    await q.query(
      `CREATE INDEX rto_disputes_status_idx ON rto_disputes (status);`,
    );

    // FK constraints to shipments / orders. We add NOT VALID + VALIDATE so
    // the constraint check doesn't block on existing rows; the table is
    // brand new so this is a formality, but it keeps the pattern consistent
    // with 1718160000005-AddNdrCases.
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_rto_disputes_shipment'
        ) THEN
          ALTER TABLE rto_disputes
            ADD CONSTRAINT fk_rto_disputes_shipment
            FOREIGN KEY ("shipmentId") REFERENCES shipments(id)
            ON DELETE CASCADE NOT VALID;
          ALTER TABLE rto_disputes VALIDATE CONSTRAINT fk_rto_disputes_shipment;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_rto_disputes_order'
        ) THEN
          ALTER TABLE rto_disputes
            ADD CONSTRAINT fk_rto_disputes_order
            FOREIGN KEY ("orderId") REFERENCES orders(id)
            ON DELETE CASCADE NOT VALID;
          ALTER TABLE rto_disputes VALIDATE CONSTRAINT fk_rto_disputes_order;
        END IF;
      END $$;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS rto_disputes;`);
  }
}
