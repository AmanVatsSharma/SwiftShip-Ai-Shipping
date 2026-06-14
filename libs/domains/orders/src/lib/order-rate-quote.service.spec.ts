import { Test, TestingModule } from '@nestjs/testing';
import { OrderRateQuoteService } from './order-rate-quote.service';
import { TenantContext } from '@swiftship/domains-tenants';
import type { RankedRateQuote } from '@swiftship/domains-rate-shop';

/**
 * SS-015 — `OrderRateQuoteService` unit tests.
 *
 * We stub the TypeORM repository with an in-memory recorder so we can
 * assert exactly which fields the service maps from the ranker's payload.
 */
describe('OrderRateQuoteService', () => {
  let service: OrderRateQuoteService;
  let tenantContext: { getTenantId: jest.Mock };
  let savedRecords: any[];

  beforeEach(async () => {
    savedRecords = [];
    tenantContext = { getTenantId: jest.fn().mockReturnValue(7) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderRateQuoteService,
        {
          provide: 'OrderRateQuoteEntityRepository',
          useValue: {
            create: jest.fn((data: any) => data),
            save: jest.fn(async (records: any[]) => {
              savedRecords.push(...records);
              return records;
            }),
          },
        },
        {
          provide: TenantContext,
          useValue: tenantContext,
        },
      ],
    }).compile();

    service = module.get(OrderRateQuoteService);
    // Override the injected repository with our stub.
    (service as any).quotes = {
      create: jest.fn((data: any) => data),
      save: jest.fn(async (records: any[]) => {
        savedRecords.push(...records);
        return records;
      }),
    };
  });

  const mkRanked = (overrides: Partial<RankedRateQuote> & { carrierCode: string }): RankedRateQuote => ({
    carrier: overrides.carrierCode,
    carrierCode: overrides.carrierCode,
    serviceType: overrides.serviceType ?? 'STANDARD',
    rate: overrides.rate ?? 9900,
    currency: 'INR',
    estimatedDays: overrides.estimatedDays ?? { min: 2, max: 4 },
    codAvailable: true,
    pickupAvailable: true,
    expiresAt: new Date('2026-06-15T00:00:00Z'),
    ranking: overrides.ranking ?? {
      position: 1,
      score: 0.9,
      costRank: 1,
      slaRank: 1,
      reliabilityRank: 1,
      effectiveCostPaise: 9900,
      expectedRtoLossPaise: 0,
      courierScore: 85,
      reasonWhyNotFirst: 'Best match for your strategy',
    },
  });

  it('persists one row per ranked quote', async () => {
    const ranked: RankedRateQuote[] = [
      mkRanked({ carrierCode: 'CHEAP' }),
      mkRanked({
        carrierCode: 'FAST',
        ranking: {
          position: 2, score: 0.5, costRank: 2, slaRank: 1,
          reliabilityRank: 2, effectiveCostPaise: 14900,
          expectedRtoLossPaise: 0, courierScore: 95,
          reasonWhyNotFirst: 'Rs 50 more',
        },
      }),
      mkRanked({
        carrierCode: 'BAL',
        ranking: {
          position: 3, score: 0.1, costRank: 3, slaRank: 2,
          reliabilityRank: 3, effectiveCostPaise: 11900,
          expectedRtoLossPaise: 0, courierScore: 80,
          reasonWhyNotFirst: 'Rs 20 more',
        },
      }),
    ];

    await service.recordRankedQuotes(42, ranked);

    expect(savedRecords).toHaveLength(3);
    expect(savedRecords.map((r: any) => r.carrierCode)).toEqual(['CHEAP', 'FAST', 'BAL']);
    expect(savedRecords.map((r: any) => r.position)).toEqual([1, 2, 3]);
    expect(savedRecords.every((r: any) => r.orderId === 42)).toBe(true);
  });

  it('reads tenantId from TenantContext and writes it to every row', async () => {
    tenantContext.getTenantId.mockReturnValue(99);
    const ranked = [mkRanked({ carrierCode: 'A' }), mkRanked({ carrierCode: 'B' })];

    await service.recordRankedQuotes(1, ranked);

    expect(savedRecords.every((r: any) => r.tenantId === 99)).toBe(true);
  });

  it('falls back to tenantId=1 when TenantContext returns null', async () => {
    tenantContext.getTenantId.mockReturnValue(null);
    const ranked = [mkRanked({ carrierCode: 'A' })];

    await service.recordRankedQuotes(1, ranked);

    expect(savedRecords[0].tenantId).toBe(1);
  });

  it('writes the entire RankedRateQuote into the fullQuote JSONB column', async () => {
    const winner = mkRanked({ carrierCode: 'WIN' });
    const ranked = [winner];

    await service.recordRankedQuotes(5, ranked);

    // fullQuote must carry the whole payload, not a sliced version.
    expect(savedRecords[0].fullQuote).toEqual(winner);
    expect(savedRecords[0].fullQuote.carrierCode).toBe('WIN');
    expect(savedRecords[0].fullQuote.ranking.position).toBe(1);
  });

  it('maps rate and ranking fields to the audit row columns', async () => {
    const winner = mkRanked({
      carrierCode: 'WIN',
      rate: 12500,
      estimatedDays: { min: 1, max: 3 },
      ranking: {
        position: 1, score: 0.95, costRank: 1, slaRank: 1,
        reliabilityRank: 1, effectiveCostPaise: 13500,
        expectedRtoLossPaise: 1000, courierScore: 90,
        reasonWhyNotFirst: 'Best match for your strategy',
      },
    });

    await service.recordRankedQuotes(11, [winner]);

    const row = savedRecords[0];
    expect(row.ratePaise).toBe(12500);
    expect(row.etaDaysMin).toBe(1);
    expect(row.etaDaysMax).toBe(3);
    expect(row.position).toBe(1);
    expect(row.rankingScore).toBe(0.95);
    expect(row.effectiveCostPaise).toBe(13500);
    expect(row.expectedRtoLossPaise).toBe(1000);
  });
});
