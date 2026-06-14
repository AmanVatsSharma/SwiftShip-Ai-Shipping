import { Test, TestingModule } from '@nestjs/testing';
import { RateRankingResolver } from './rate-ranking.resolver';
import { RateRankingService } from './rate-ranking.service';
import { RateSimulatorService } from './rate-simulator.service';
import {
  RankedRateShopInput,
  RateRankingStrategy,
  RateSimulationOverrides,
} from './rate-shop.input';
import type { RateQuote } from '@swiftship/platform-carriers';

/**
 * SS-010 — `RateRankingResolver` unit tests.
 *
 * The resolver is a thin shim around `RateRankingService`:
 *   1. Map `RankedRateShopInput` → `RateQuoteRequest` + `RateRankingPreferences`.
 *   2. Call `service.rank(req, prefs)`.
 *   3. Wrap the result in `RankedRateShopResult` (quotes, totalCandidates, appliedStrategy).
 *
 * SS-013 extended the resolver with `simulateRateShop` and
 * `simulateRateShopBatch`. These delegate to `RateSimulatorService`,
 * which is also mocked here so the resolver tests stay focused on the
 * input → service-call shape and the response wrapper.
 */
describe('RateRankingResolver', () => {
  let resolver: RateRankingResolver;
  let ranker: jest.Mocked<RateRankingService>;
  let simulator: jest.Mocked<RateSimulatorService>;

  const sampleInput: RankedRateShopInput = {
    originPincode: '110001',
    destinationPincode: '560001',
    weightGrams: 500,
    paymentMethod: 'PREPAID',
    declaredValuePaise: 10000,
    strategy: RateRankingStrategy.BEST_VALUE,
    maxDeliveryDays: 5,
    minCourierScore: 60,
  };

  const sampleRankedQuote: RateQuote & {
    ranking: {
      position: number;
      score: number;
      costRank: number;
      slaRank: number;
      reliabilityRank: number;
      effectiveCostPaise: number;
      expectedRtoLossPaise: number;
      courierScore?: number;
      reasonWhyNotFirst?: string;
    };
  } = {
    carrier: 'X',
    carrierCode: 'X',
    serviceType: 'STANDARD',
    rate: 9900,
    currency: 'INR',
    estimatedDays: { min: 2, max: 3 },
    codAvailable: true,
    pickupAvailable: true,
    expiresAt: new Date(),
    ranking: {
      position: 1,
      score: 1,
      costRank: 1,
      slaRank: 1,
      reliabilityRank: 1,
      effectiveCostPaise: 9900,
      expectedRtoLossPaise: 0,
      courierScore: 85,
      reasonWhyNotFirst: 'Best match for your strategy',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateRankingResolver,
        {
          provide: RateRankingService,
          useValue: {
            rank: jest.fn().mockResolvedValue([sampleRankedQuote]),
          },
        },
        {
          provide: RateSimulatorService,
          useValue: {
            simulateOne: jest
              .fn()
              .mockResolvedValue({
                quotes: [
                  {
                    carrier: 'X',
                    carrierCode: 'X',
                    serviceType: 'STANDARD',
                    rate: 9900,
                    currency: 'INR',
                    etaDaysMin: 2,
                    etaDaysMax: 3,
                    codAvailable: true,
                    pickupAvailable: true,
                    expiresAt: new Date(),
                    ranking: {
                      position: 1,
                      score: 1,
                      costRank: 1,
                      slaRank: 1,
                      reliabilityRank: 1,
                      effectiveCostPaise: 9900,
                      expectedRtoLossPaise: 0,
                      courierScore: 85,
                      reasonWhyNotFirst:
                        'Best match for your strategy',
                    },
                  },
                ],
                totalCandidates: 1,
                appliedStrategy: RateRankingStrategy.BEST_VALUE,
              }),
            simulateScenarios: jest
              .fn()
              .mockImplementation(
                async (
                  _base: RankedRateShopInput,
                  scenarios: RateSimulationOverrides[],
                ) =>
                  scenarios.map((_, i) => ({
                    quotes: [
                      {
                        carrier: `S${i}`,
                        carrierCode: `S${i}`,
                        serviceType: 'STANDARD',
                        rate: 9900,
                        currency: 'INR',
                        etaDaysMin: 2,
                        etaDaysMax: 3,
                        codAvailable: true,
                        pickupAvailable: true,
                        expiresAt: new Date(),
                        ranking: {
                          position: 1,
                          score: 1,
                          costRank: 1,
                          slaRank: 1,
                          reliabilityRank: 1,
                          effectiveCostPaise: 9900,
                          expectedRtoLossPaise: 0,
                          courierScore: 85,
                          reasonWhyNotFirst:
                            'Best match for your strategy',
                        },
                      },
                    ],
                    totalCandidates: 1,
                    appliedStrategy: RateRankingStrategy.BEST_VALUE,
                  })),
              ),
          },
        },
      ],
    }).compile();

    resolver = module.get<RateRankingResolver>(RateRankingResolver);
    ranker = module.get(RateRankingService);
    simulator = module.get(RateSimulatorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  it('returns a RankedRateShopResult with quotes, totalCandidates, appliedStrategy', async () => {
    const result = await resolver.rankedRateShop(sampleInput);
    expect(result.quotes).toHaveLength(1);
    expect(result.totalCandidates).toBe(1);
    expect(result.appliedStrategy).toBe(RateRankingStrategy.BEST_VALUE);
  });

  it('forwards the RateQuoteRequest fields to the service', async () => {
    await resolver.rankedRateShop(sampleInput);
    expect(ranker.rank).toHaveBeenCalledWith(
      {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID',
        declaredValue: 10000,
      },
      expect.objectContaining({
        strategy: 'best_value',
        maxDeliveryDays: 5,
        minCourierScore: 60,
        codAmountPaise: 10000,
      }),
    );
  });

  it('lowercases the strategy enum before passing it to the service', async () => {
    const input: RankedRateShopInput = {
      ...sampleInput,
      strategy: RateRankingStrategy.RELIABILITY_FIRST,
    };
    await resolver.rankedRateShop(input);
    expect(ranker.rank).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ strategy: 'reliability_first' }),
    );
  });

  it('reflects the actual strategy in appliedStrategy', async () => {
    const result = await resolver.rankedRateShop({
      ...sampleInput,
      strategy: RateRankingStrategy.CHEAPEST,
    });
    expect(result.appliedStrategy).toBe(RateRankingStrategy.CHEAPEST);
  });

  it('totalCandidates matches the post-filter quote count (not the raw rate shop count)', async () => {
    ranker.rank.mockResolvedValueOnce([
      sampleRankedQuote,
      { ...sampleRankedQuote, carrierCode: 'Y' },
      { ...sampleRankedQuote, carrierCode: 'Z' },
    ]);
    const result = await resolver.rankedRateShop(sampleInput);
    expect(result.totalCandidates).toBe(3);
  });

  it('handles an empty result without throwing', async () => {
    ranker.rank.mockResolvedValueOnce([]);
    const result = await resolver.rankedRateShop(sampleInput);
    expect(result.quotes).toEqual([]);
    expect(result.totalCandidates).toBe(0);
    expect(result.appliedStrategy).toBe(RateRankingStrategy.BEST_VALUE);
  });

  // -------------------------------------------------------------------------
  // SS-013: simulateRateShop / simulateRateShopBatch
  // -------------------------------------------------------------------------

  it('simulateRateShop returns a RankedRateShopResult', async () => {
    const overrides: RateSimulationOverrides = { weightGrams: 800 };
    const result = await resolver.simulateRateShop(sampleInput, overrides);
    expect(result).toBeDefined();
    expect(result.quotes).toHaveLength(1);
    expect(result.totalCandidates).toBe(1);
    expect(result.appliedStrategy).toBe(RateRankingStrategy.BEST_VALUE);
  });

  it('simulateRateShop forwards the baseInput and overrides to the simulator', async () => {
    const overrides: RateSimulationOverrides = {
      weightGrams: 800,
      paymentMethod: 'COD',
    };
    await resolver.simulateRateShop(sampleInput, overrides);
    expect(simulator.simulateOne).toHaveBeenCalledWith(sampleInput, overrides);
    expect(simulator.simulateOne).toHaveBeenCalledTimes(1);
  });

  it('simulateRateShopBatch returns an array of length matching the scenarios', async () => {
    const scenarios: RateSimulationOverrides[] = [
      { weightGrams: 800 },
      { paymentMethod: 'COD' },
    ];
    const result = await resolver.simulateRateShopBatch(sampleInput, scenarios);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(simulator.simulateScenarios).toHaveBeenCalledWith(
      sampleInput,
      scenarios,
    );
  });

  it('simulateRateShopBatch returns an empty array when scenarios is empty', async () => {
    const result = await resolver.simulateRateShopBatch(sampleInput, []);
    expect(result).toEqual([]);
    expect(simulator.simulateScenarios).toHaveBeenCalledWith(sampleInput, []);
  });
});
