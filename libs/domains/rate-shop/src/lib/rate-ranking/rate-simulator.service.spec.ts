import { Test, TestingModule } from '@nestjs/testing';
import { RateSimulatorService } from './rate-simulator.service';
import { RateRankingService } from './rate-ranking.service';
import {
  RankedRateShopInput,
  RateSimulationOverrides,
  RateRankingStrategy,
} from './rate-shop.input';
import type { RankedRateQuote } from './rate-ranking.service';

describe('RateSimulatorService', () => {
  let service: RateSimulatorService;
  let ranker: jest.Mocked<RateRankingService>;

  const baseInput: RankedRateShopInput = {
    originPincode: '110001',
    destinationPincode: '560001',
    weightGrams: 500,
    paymentMethod: 'PREPAID',
    declaredValuePaise: 5000,
    strategy: RateRankingStrategy.BEST_VALUE,
    maxDeliveryDays: 5,
    minCourierScore: 60,
  };

  const rankedQuote: RankedRateQuote = {
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
        RateSimulatorService,
        {
          provide: RateRankingService,
          useValue: {
            rank: jest.fn().mockResolvedValue([rankedQuote]),
          },
        },
      ],
    }).compile();

    service = module.get<RateSimulatorService>(RateSimulatorService);
    ranker = module.get(RateRankingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // simulateOne — override propagation
  // -------------------------------------------------------------------------

  it('simulateOne with weightGrams override calls ranker with the new weight', async () => {
    const overrides: RateSimulationOverrides = { weightGrams: 800 };
    await service.simulateOne(baseInput, overrides);

    // The ranker must see weightGrams=800 (from the overrides), not the base 500.
    expect(ranker.rank).toHaveBeenCalledWith(
      expect.objectContaining({ weightGrams: 800 }),
      expect.anything(),
    );
    // The other base fields must still be forwarded unchanged.
    expect(ranker.rank).toHaveBeenCalledWith(
      expect.objectContaining({
        originPincode: '110001',
        destinationPincode: '560001',
        paymentMethod: 'PREPAID',
      }),
      expect.anything(),
    );
  });

  it('simulateOne with paymentMethod: COD calls ranker with the new payment method', async () => {
    const overrides: RateSimulationOverrides = { paymentMethod: 'COD' };
    await service.simulateOne(baseInput, overrides);

    expect(ranker.rank).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'COD' }),
      expect.anything(),
    );
  });

  it('simulateOne with destinationPincode override forwards the new PIN', async () => {
    const overrides: RateSimulationOverrides = { destinationPincode: '999999' };
    await service.simulateOne(baseInput, overrides);

    expect(ranker.rank).toHaveBeenCalledWith(
      expect.objectContaining({ destinationPincode: '999999' }),
      expect.anything(),
    );
  });

  it('simulateOne with empty overrides produces the same ranker call as the base', async () => {
    await service.simulateOne(baseInput, {});

    const callArgs = ranker.rank.mock.calls[0];
    const [req, prefs] = callArgs;
    expect(req).toEqual({
      originPincode: '110001',
      destinationPincode: '560001',
      weightGrams: 500,
      paymentMethod: 'PREPAID',
      declaredValue: 5000,
    });
    expect(prefs).toEqual({
      strategy: 'best_value',
      maxDeliveryDays: 5,
      minCourierScore: 60,
      codAmountPaise: 5000,
    });
  });

  it('simulateOne lowercases the strategy enum before passing to the ranker', async () => {
    const input: RankedRateShopInput = {
      ...baseInput,
      strategy: RateRankingStrategy.RELIABILITY_FIRST,
    };
    await service.simulateOne(input, {});

    expect(ranker.rank).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ strategy: 'reliability_first' }),
    );
  });

  it('simulateOne builds prefs.codAmountPaise from declaredValuePaise (not codAmount)', async () => {
    await service.simulateOne(baseInput, {});

    expect(ranker.rank).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ codAmountPaise: 5000 }),
    );
  });

  // -------------------------------------------------------------------------
  // simulateScenarios — parallel fan-out
  // -------------------------------------------------------------------------

  it('simulateScenarios runs all scenarios in parallel and returns results in order', async () => {
    const s1: RateSimulationOverrides = { weightGrams: 600 };
    const s2: RateSimulationOverrides = { paymentMethod: 'COD' };
    const s3: RateSimulationOverrides = { destinationPincode: '411001' };

    // Use different mock responses per scenario so we can verify order.
    ranker.rank
      .mockResolvedValueOnce([{ ...rankedQuote, carrierCode: 'S1' }])
      .mockResolvedValueOnce([{ ...rankedQuote, carrierCode: 'S2' }])
      .mockResolvedValueOnce([{ ...rankedQuote, carrierCode: 'S3' }]);

    const results = await service.simulateScenarios(baseInput, [s1, s2, s3]);

    expect(results).toHaveLength(3);
    // Results must appear in the same order as the scenarios array.
    expect(results[0].quotes[0].carrierCode).toBe('S1');
    expect(results[1].quotes[0].carrierCode).toBe('S2');
    expect(results[2].quotes[0].carrierCode).toBe('S3');
    // All three ranker calls happened.
    expect(ranker.rank).toHaveBeenCalledTimes(3);
  });

  it('simulateScenarios with empty array returns empty array', async () => {
    const results = await service.simulateScenarios(baseInput, []);
    expect(results).toEqual([]);
    expect(ranker.rank).not.toHaveBeenCalled();
  });

  it('simulateScenarios runs ranker with correct args for each scenario', async () => {
    const s1: RateSimulationOverrides = { weightGrams: 700 };
    const s2: RateSimulationOverrides = { paymentMethod: 'COD', maxDeliveryDays: 2 };

    ranker.rank
      .mockResolvedValueOnce([rankedQuote])
      .mockResolvedValueOnce([rankedQuote]);

    await service.simulateScenarios(baseInput, [s1, s2]);

    // First call: weight overridden, rest from base.
    expect(ranker.rank).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ weightGrams: 700, paymentMethod: 'PREPAID' }),
      expect.anything(),
    );
    // Second call: paymentMethod and maxDeliveryDays overridden.
    expect(ranker.rank).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ paymentMethod: 'COD' }),
      expect.objectContaining({ maxDeliveryDays: 2 }),
    );
  });
});
