import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddOrderRateQuotes — SS-015.
 *
 * Audit/analytics table for the rate-engine auto-pick. One row per ranked
 * quote that `RateRankingService` produced at order-creation time, so the
 * merchant can later see:
 *   - "Why was this carrier picked for order #123?"  (drill into breakdown)
 *   - "What would the runner-up have cost?"          (replay the ranking)
 *   - "What's the historical RTO% for orders like this?" (analytics)
 *
 * Position 1 is the auto-picked winner. The full `RankedRateQuote` payload
 * is stashed in `fullQuote` (jsonb) for replay.
 *
 * All money in paise (int) — never doubles.
 */
export class AddOrderRateQuotes1718160000004 implements MigrationInterface {
  name = 'AddOrderRateQuotes1718160000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Defensive: skip if exists (re-runs in dev when synchronize is on
    // and the entity auto-created the table).
    const exists = await queryRunner.query(
      `SELECT 1 FROM pg_tables WHERE tablename = 'order_rate_quotes'`,
    );
    if (exists.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE order_rate_quotes (
        id SERIAL PRIMARY KEY,
        "orderId" INTEGER NOT NULL,
        "tenantId" INTEGER NOT NULL DEFAULT 1,
        "carrierCode" VARCHAR(64) NOT NULL,
        "serviceType" VARCHAR(32) NOT NULL,
        "ratePaise" INTEGER NOT NULL,
        "etaDaysMin" INTEGER NOT NULL,
        "etaDaysMax" INTEGER NOT NULL,
        position INTEGER NOT NULL,
        "rankingScore" DOUBLE PRECISION NOT NULL,
        "effectiveCostPaise" INTEGER NOT NULL,
        "expectedRtoLossPaise" INTEGER NOT NULL,
        "fullQuote" JSONB NOT NULL,
        "rankedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX order_rate_quotes_orderId_idx
        ON order_rate_quotes ("orderId");
    `);
    await queryRunner.query(`
      CREATE INDEX order_rate_quotes_tenantId_idx
        ON order_rate_quotes ("tenantId");
    `);
    await queryRunner.query(`
      ALTER TABLE order_rate_quotes
        ADD CONSTRAINT fk_order_rate_quotes_order
        FOREIGN KEY ("orderId") REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS order_rate_quotes;`);
  }
}
