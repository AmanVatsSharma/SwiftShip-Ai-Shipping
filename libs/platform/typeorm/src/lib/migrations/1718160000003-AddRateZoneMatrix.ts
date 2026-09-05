import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddRateZoneMatrix — SS-011.
 *
 * Adds the `rate_zone_matrix` table — the 5×5 zone-pairs base rate table used
 * by the rate-math lib to post-process carrier quotes.
 *
 * The matrix is keyed by (carrierCode, originZone, destZone). baseRatePaise
 * is BIGINT to match the all-paise invariant used everywhere else in the
 * billing system. weightSlabGrams records the slab this rate is for; the
 * rate-math lib rounds the actual weight up to this slab when computing
 * the billable weight.
 *
 * Also seeds 13 carriers × 25 zone-pairs = 325 placeholder rows so dev has
 * something to look at. Replace with real carrier rate cards in a follow-up
 * migration once the carrier POCs publish their zone matrices.
 */
export class AddRateZoneMatrix1718160000003 implements MigrationInterface {
  name = 'AddRateZoneMatrix1718160000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rate_zone_matrix" (
        "id" SERIAL NOT NULL,
        "carrierCode" varchar(64) NOT NULL,
        "originZone" varchar(4) NOT NULL,
        "destZone" varchar(4) NOT NULL,
        "baseRatePaise" bigint NOT NULL,
        "weightSlabGrams" int NOT NULL DEFAULT 500,
        "tenantId" int NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "rate_zone_matrix_carrier_pair_key" UNIQUE ("carrierCode", "originZone", "destZone"),
        CONSTRAINT "PK_rate_zone_matrix" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rate_zone_matrix_tenantId"
      ON "rate_zone_matrix" ("tenantId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rate_zone_matrix_carrier"
      ON "rate_zone_matrix" ("carrierCode")
    `);

    // Seed 13 carriers × 25 zone-pairs. Rates are illustrative placeholders
    // (the same flat 99 INR per 500g slab regardless of zone) — real values
    // come from each carrier's published zone matrix.
    const carriers = [
      'DELHIVERY',
      'BLUEDART',
      'DTDC',
      'FEDEX',
      'DHL',
      'E_COM',
      'XPRESSBEES',
      'SHADOWFAX',
      'EKART',
      'PROFESSIONAL_COURIER',
      'INDIA_POST',
      'AMAZON',
      'FLIPKART',
    ];
    const zones = ['A', 'B', 'C', 'D', 'E'];
    for (const carrierCode of carriers) {
      for (const originZone of zones) {
        for (const destZone of zones) {
          // Same-zone (A→A) is cheapest; cross-zone (A→E) is most expensive.
          // Placeholder formula: 99 INR base + 11 INR per zone step.
          const zoneStep = Math.abs(
            zones.indexOf(destZone) - zones.indexOf(originZone),
          );
          const baseRatePaise = (99 + zoneStep * 11) * 100;
          await queryRunner.query(
            `INSERT INTO "rate_zone_matrix"
              ("carrierCode", "originZone", "destZone", "baseRatePaise", "weightSlabGrams", "tenantId")
              VALUES ($1, $2, $3, $4, 500, 1)
              ON CONFLICT ("carrierCode", "originZone", "destZone") DO NOTHING`,
            [carrierCode, originZone, destZone, baseRatePaise],
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_zone_matrix"`);
  }
}
