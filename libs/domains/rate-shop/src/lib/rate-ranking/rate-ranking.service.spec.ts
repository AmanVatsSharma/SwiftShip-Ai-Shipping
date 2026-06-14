import { Test, TestingModule } from '@nestjs/testing';
import { RateRankingService } from './rate-ranking.service';
import { RateShopService } from '@swiftship/platform-rate-cache';
import { RateMathService } from '@swiftship/platform-rate-math';
import { CourierScoreService } from '@swiftship/domains-dashboard';
import type { RateQuote, RateQuoteRequest } from '@swiftship/platform-carriers';

/**
 * SS-010 — `RateRankingService` unit tests.
 *
 * We mock the three upstream services (`RateShopService`, `RateMathService`,
 * `CourierScoreService`) so the test exercises the ranker's strategy and
 * filter logic in isolation. The mocks return a fixed set of three carrier
 * quotes that vary along the three axes the ranker cares about (cost, sla,
 * score) so each strategy can be verified.
 */
describe('RateRankingService', () => {
  let service: RateRankingService;
  let rateShop: jest.Mocked<RateShopService>;
  let rateMath: jest.Mocked<RateMathService>;
  let courierScore: jest.Mocked<CourierScoreService>;

  // The mock rate shop returns these three raw quotes; the math service
  // passes them through with the `rate` field intact (so the ranker sees
  // the post-surcharge rate as the raw rate).
  const baseReq: RateQuoteRequest = {
    originPincode: '110001',
    destinationPincode: '560001',
    weightGrams: 500,
    paymentMethod: 'PREPAID',
  };

  const cheap: RateQuote = mkQuote({
    carrierCode: 'CHEAP',
    rate: 9900, // ₹99
    estimatedDays: { min: 4, max: 6 },
  });
  const fast: RateQuote = mkQuote({
    carrierCode: 'FAST',
    rate: 14900, // ₹149
    estimatedDays: { min: 1, max: 2 },
  });
  const balanced: RateQuote = mkQuote({
    carrierCode: 'BAL',
    rate: 11900, // ₹119
    estimatedDays: { min: 2, max: 3 },
  });

  const allRaw = [cheap, fast, balanced];

  // Map carrierCode → courier score (used by reliability_first, etc.).
  const scores: Record<string, number> = {
    CHEAP: 60, // low score — high RTO penalty
    FAST: 95, // very reliable
    BAL: 85,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateRankingService,
        {
          provide: RateShopService,
          useValue: {
            shopRates: jest.fn().mockResolvedValue(allRaw),
          },
        },
        {
          provide: RateMathService,
          useValue: {
            // Pass-through mock — the ranker treats the result as the
            // post-surcharge rate. We copy the input to keep the
            // shape identical to what `applySurcharges` returns.
            applySurcharges: jest.fn(async (q: RateQuote) => ({
              ...q,
              metadata: { ...(q.metadata ?? {}), breakdown: {} },
            })),
          },
        },
        {
          provide: CourierScoreService,
          useValue: {
            getScorecards: jest.fn(async () =>
              Object.entries(scores).map(([code, score]) => ({
                carrierId: 0,
                carrierCode: code,
                carrierName: code,
                delivered: 100,
                onTime: 80,
                ndr: 5,
                rto: 10,
                damaged: 1,
                attempted: 100,
                score,
              })),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<RateRankingService>(RateRankingService);
    rateShop = module.get(RateShopService);
    rateMath = module.get(RateMathService);
    courierScore = module.get(CourierScoreService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Strategy coverage
  // -------------------------------------------------------------------------

  it('strategy: cheapest sorts by rate ascending', async () => {
    const result = await service.rank(baseReq, { strategy: 'cheapest' });
    expect(result.map((q) => q.carrierCode)).toEqual(['CHEAP', 'BAL', 'FAST']);
    // First is the cheapest; ranking.position is 1-indexed.
    expect(result[0].ranking.position).toBe(1);
    expect(result[0].ranking.costRank).toBe(1);
    expect(result[2].ranking.costRank).toBe(3);
  });

  it('strategy: fastest sorts by etaDays.max ascending', async () => {
    const result = await service.rank(baseReq, { strategy: 'fastest' });
    expect(result.map((q) => q.carrierCode)).toEqual(['FAST', 'BAL', 'CHEAP']);
    expect(result[0].ranking.slaRank).toBe(1);
  });

  it('strategy: reliability_first sorts by courier score descending', async () => {
    const result = await service.rank(baseReq, {
      strategy: 'reliability_first',
    });
    expect(result.map((q) => q.carrierCode)).toEqual(['FAST', 'BAL', 'CHEAP']);
    expect(result[0].ranking.reliabilityRank).toBe(1);
  });

  it('strategy: best_value balances cost, sla, and reliability', async () => {
    const result = await service.rank(baseReq, { strategy: 'best_value' });
    // No strict ordering assertion — best_value is a weighted blend.
    // We do assert that the balanced carrier (BAL) outranks the cheap
    // one in this fixture because the cheap one has poor reliability
    // (score 60) and slow SLA (6 days max).
    const balIdx = result.findIndex((q) => q.carrierCode === 'BAL');
    const cheapIdx = result.findIndex((q) => q.carrierCode === 'CHEAP');
    expect(balIdx).toBeLessThan(cheapIdx);
    // All quotes have ranking.score in [0, 1] with position 1 having
    // the highest score.
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].ranking.score).toBeGreaterThanOrEqual(
        result[i + 1].ranking.score,
      );
    }
  });

  it('strategy: balanced uses the same weights as best_value', async () => {
    const bv = await service.rank(baseReq, { strategy: 'best_value' });
    const bal = await service.rank(baseReq, { strategy: 'balanced' });
    expect(bal.map((q) => q.carrierCode)).toEqual(bv.map((q) => q.carrierCode));
  });

  it('strategy: best_value honors custom weights', async () => {
    // Heavily weight cost — cheapest should be first.
    const result = await service.rank(baseReq, {
      strategy: 'best_value',
      weights: { cost: 1, sla: 0, reliability: 0 },
    });
    expect(result[0].carrierCode).toBe('CHEAP');
  });

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  it('filter: maxDeliveryDays removes carriers with etaDays.max > cap', async () => {
    const result = await service.rank(baseReq, {
      strategy: 'best_value',
      maxDeliveryDays: 3,
    });
    const codes = result.map((q) => q.carrierCode);
    expect(codes).not.toContain('CHEAP'); // CHEAP has etaDays.max=6
    expect(codes).toContain('FAST'); // etaDays.max=2
    expect(codes).toContain('BAL'); // etaDays.max=3
  });

  it('filter: minCourierScore removes carriers below the threshold', async () => {
    const result = await service.rank(baseReq, {
      strategy: 'best_value',
      minCourierScore: 80,
    });
    const codes = result.map((q) => q.carrierCode);
    expect(codes).not.toContain('CHEAP'); // score 60
    expect(codes).toContain('FAST'); // 95
    expect(codes).toContain('BAL'); // 85
  });

  it('filter: combined SLA + score filters narrow correctly', async () => {
    const result = await service.rank(baseReq, {
      strategy: 'best_value',
      maxDeliveryDays: 3,
      minCourierScore: 80,
    });
    expect(result.map((q) => q.carrierCode)).toEqual(['FAST', 'BAL']);
  });

  it('empty carrier list returns []', async () => {
    rateShop.shopRates.mockResolvedValueOnce([]);
    const result = await service.rank(baseReq, { strategy: 'cheapest' });
    expect(result).toEqual([]);
  });

  it('filters that exclude everyone return []', async () => {
    const result = await service.rank(baseReq, {
      strategy: 'cheapest',
      maxDeliveryDays: 1, // nobody fits
    });
    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // RTO penalty math
  // -------------------------------------------------------------------------

  it('RTO penalty: declaredValue=10000 paise, score=50 → expectedRtoLoss ≈ 5000 paise', async () => {
    // Build a single-carrier fixture so the math is unambiguous.
    rateShop.shopRates.mockResolvedValueOnce([
      mkQuote({ carrierCode: 'X', rate: 10000, estimatedDays: { min: 2, max: 2 } }),
    ]);
    courierScore.getScorecards.mockResolvedValueOnce([
      {
        carrierId: 0,
        carrierCode: 'X',
        carrierName: 'X',
        delivered: 100,
        onTime: 80,
        ndr: 5,
        rto: 10,
        damaged: 1,
        attempted: 100,
        score: 50,
      },
    ]);
    const result = await service.rank(baseReq, {
      strategy: 'cheapest',
      codAmountPaise: 10000,
    });
    expect(result).toHaveLength(1);
    expect(result[0].ranking.expectedRtoLossPaise).toBe(5000);
    expect(result[0].ranking.effectiveCostPaise).toBe(15000);
    expect(result[0].ranking.courierScore).toBe(50);
  });

  it('RTO penalty: no declaredValue → expectedRtoLoss is 0', async () => {
    rateShop.shopRates.mockResolvedValueOnce([
      mkQuote({ carrierCode: 'X', rate: 10000, estimatedDays: { min: 2, max: 2 } }),
    ]);
    const result = await service.rank(baseReq, { strategy: 'cheapest' });
    expect(result[0].ranking.expectedRtoLossPaise).toBe(0);
    expect(result[0].ranking.effectiveCostPaise).toBe(10000);
  });

  it('falls back to score 75 when the carrier has no row in courier_score_daily', async () => {
    rateShop.shopRates.mockResolvedValueOnce([
      mkQuote({ carrierCode: 'UNKNOWN', rate: 10000, estimatedDays: { min: 2, max: 2 } }),
    ]);
    courierScore.getScorecards.mockResolvedValueOnce([]); // no scorecards
    const result = await service.rank(baseReq, {
      strategy: 'cheapest',
      codAmountPaise: 10000,
    });
    // rtoPct = 1 - 75/100 = 0.25, loss = 2500 paise
    expect(result[0].ranking.courierScore).toBe(75);
    expect(result[0].ranking.expectedRtoLossPaise).toBe(2500);
  });

  it('tolerates CourierScoreService throwing — falls back to 75 for every carrier', async () => {
    courierScore.getScorecards.mockRejectedValueOnce(new Error('db down'));
    const result = await service.rank(baseReq, { strategy: 'cheapest' });
    expect(result).toHaveLength(3);
    for (const q of result) {
      expect(q.ranking.courierScore).toBe(75);
    }
  });

  it('falls back to 75 when CourierScoreService is not provided (test injects nothing)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        RateRankingService,
        {
          provide: RateShopService,
          useValue: { shopRates: jest.fn().mockResolvedValue(allRaw) },
        },
        {
          provide: RateMathService,
          useValue: { applySurcharges: jest.fn(async (q: RateQuote) => q) },
        },
        // CourierScoreService intentionally not provided — service
        // should default to 75 for every carrier.
      ],
    }).compile();
    const bare = module.get(RateRankingService);
    const result = await bare.rank(baseReq, { strategy: 'cheapest' });
    expect(result).toHaveLength(3);
    for (const q of result) {
      expect(q.ranking.courierScore).toBe(75);
    }
  });

  // -------------------------------------------------------------------------
  // reasonWhyNotFirst
  // -------------------------------------------------------------------------

  it('reasonWhyNotFirst: position 1 reads "Best match for your strategy"', async () => {
    const result = await service.rank(baseReq, { strategy: 'cheapest' });
    expect(result[0].ranking.reasonWhyNotFirst).toBe(
      'Best match for your strategy',
    );
  });

  it('reasonWhyNotFirst: subsequent positions name the cost diff in rupees', async () => {
    const result = await service.rank(baseReq, { strategy: 'cheapest' });
    // BAL is ₹20 more than CHEAP (11900 - 9900 = 2000 paise → ₹20.00).
    const bal = result.find((q) => q.carrierCode === 'BAL')!;
    expect(bal.ranking.reasonWhyNotFirst).toContain('20.00');
    expect(bal.ranking.reasonWhyNotFirst).toContain('cheapest');
  });

  it('reasonWhyNotFirst: mentions the SLA diff in days', async () => {
    const result = await service.rank(baseReq, { strategy: 'cheapest' });
    // CHEAP (cheapest) has etaDays.max=6, BAL has etaDays.max=3, so
    // the first quote's reason is the literal "Best match" (no
    // comparison). For the fastest quote (FAST) under cheapest
    // strategy, the reason should mention "4 day(s) slower" because
    // 6 - 2 = 4.
    const fast = result.find((q) => q.carrierCode === 'FAST')!;
    expect(fast.ranking.reasonWhyNotFirst).toMatch(/day\(s\) slower/);
  });

  // -------------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------------

  it('delegates to RateShopService with the exact request', async () => {
    await service.rank(baseReq, { strategy: 'cheapest' });
    expect(rateShop.shopRates).toHaveBeenCalledWith(baseReq);
  });

  it('runs applySurcharges once per raw quote', async () => {
    await service.rank(baseReq, { strategy: 'cheapest' });
    expect(rateMath.applySurcharges).toHaveBeenCalledTimes(3);
  });
});

/**
 * Build a `RateQuote` for the test fixture with sensible defaults for the
 * fields the ranker doesn't read (currency, expiresAt, etc.).
 */
function mkQuote(overrides: {
  carrierCode: string;
  rate: number;
  estimatedDays: { min: number; max: number };
  serviceType?: 'STANDARD' | 'EXPRESS' | 'SAME_DAY' | 'OVERNIGHT';
}): RateQuote {
  return {
    carrier: overrides.carrierCode,
    carrierCode: overrides.carrierCode,
    serviceType: overrides.serviceType ?? 'STANDARD',
    rate: overrides.rate,
    currency: 'INR',
    estimatedDays: overrides.estimatedDays,
    codAvailable: true,
    pickupAvailable: true,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}
