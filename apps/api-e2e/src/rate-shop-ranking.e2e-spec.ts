/**
 * E2E — rate-shop leg: rankedRateShop against the SANDBOX carrier.
 *
 * ENVIRONMENT NEEDS: Postgres + Redis (see support/e2e-harness.ts).
 * EXECUTED LOCALLY: NO — Docker unavailable; CI-runnable via
 *   npx nx run api-e2e:e2e --testFile=rate-shop-ranking.e2e-spec.ts
 *
 * SURFACE NOTES (verified in libs/domains/rate-shop + libs/platform/carriers):
 *  - `rankedRateShop` is guarded by TenantGuard only — the API-key header
 *    is sufficient (no JWT/roles needed).
 *  - The SANDBOX adapter is always registered by CarrierAdapterService and
 *    answers getRates without any external API and without carriers-table
 *    seeding (adapter registry is in-memory, not DB-driven).
 *  - The GraphQL strategy enum is registered from the TS enum, so the
 *    *names* (CHEAPEST/FASTEST/BEST_VALUE/…) are the GraphQL enum values,
 *    while `appliedStrategy` echoes the string value ('best_value').
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createE2eApp,
  gql,
  setupTenantStack,
  truncateAll,
} from './support/e2e-harness';

const RANKED_RATE_SHOP = /* GraphQL */ `
  query Ranked($input: RankedRateShopInput!) {
    rankedRateShop(input: $input) {
      totalCandidates
      appliedStrategy
      quotes {
        carrier
        carrierCode
        serviceType
        rate
        currency
        etaDaysMin
        etaDaysMax
        codAvailable
        ranking { position score effectiveCostPaise }
      }
    }
  }
`;

describe('Rate-shop ranking: rankedRateShop via sandbox carriers (e2e)', () => {
  let app: INestApplication;
  let apiKey: string;

  beforeAll(async () => {
    app = await createE2eApp();
    await truncateAll(app);
    const stack = await setupTenantStack(app, 'rateshop');
    apiKey = stack.apiKey;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns ranked quotes shaped for the merchant dashboard', async () => {
    const data = await gql(app, {
      query: RANKED_RATE_SHOP,
      variables: {
        input: {
          originPincode: '110001',
          destinationPincode: '560001',
          weightGrams: 500,
          paymentMethod: 'PREPAID',
          declaredValuePaise: 129900,
          strategy: 'BEST_VALUE',
        },
      },
      apiKey,
    });
    const result = data.rankedRateShop;
    expect(Array.isArray(result.quotes)).toBe(true);
    expect(result.quotes.length).toBeGreaterThanOrEqual(1);
    expect(result.totalCandidates).toBe(result.quotes.length);
    expect(result.appliedStrategy).toBe('best_value');

    const sandbox = result.quotes.find((q: any) => q.carrierCode === 'SANDBOX');
    expect(sandbox).toBeDefined();
    // Sandbox raw rate formula: 50 + ceil(500/100)*10 = 100 paise; the ranked
    // pipeline layers surcharges on top, so assert the floor + currency.
    expect(sandbox.rate).toBeGreaterThanOrEqual(100);
    expect(sandbox.currency).toBe('INR');
    expect(sandbox.etaDaysMin).toBe(2);
    expect(sandbox.etaDaysMax).toBe(4);
    expect(sandbox.ranking.position).toBeGreaterThanOrEqual(1);
  });

  it('honours the cheapest strategy (positions assigned 1..n in rate order)', async () => {
    const data = await gql(app, {
      query: RANKED_RATE_SHOP,
      variables: {
        input: {
          originPincode: '110001',
          destinationPincode: '560001',
          weightGrams: 1200,
          paymentMethod: 'PREPAID',
          strategy: 'CHEAPEST',
        },
      },
      apiKey,
    });
    const byPosition = [...data.rankedRateShop.quotes].sort(
      (a: any, b: any) => a.ranking.position - b.ranking.position,
    );
    // Cheapest strategy ranks by EFFECTIVE cost (surcharges + RTO penalty),
    // which can reorder vs the raw `rate` — assert on effectiveCostPaise.
    const costs: number[] = byPosition.map((q: any) => q.ranking.effectiveCostPaise);
    const positions: number[] = byPosition.map((q: any) => q.ranking.position);
    expect(data.rankedRateShop.appliedStrategy).toBe('cheapest');
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
    expect(positions).toEqual(costs.map((_, i) => i + 1));
  });

  it('rejects unauthenticated rate-shopping (TenantGuard)', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `query { rankedRateShop(input: { originPincode: "110001", destinationPincode: "560001", weightGrams: 500 }) { totalCandidates } }`,
      });
    expect(res.body.errors?.length ?? 0).toBeGreaterThan(0);
  });
});
