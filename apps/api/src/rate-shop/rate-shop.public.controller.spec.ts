import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RateShopPublicController } from './rate-shop.public.controller';
import { RateRankingService } from '@swiftship/domains-rate-shop';
import type { RankedRateQuote } from '@swiftship/domains-rate-shop';

/**
 * SS-014: The public controller is a thin adapter over the
 * `RateRankingService` — these tests pin down:
 *   1. happy path: a valid request flows through and the response
 *      shape (paise + INR) is correct.
 *   2. validation: each of the three required fields produces a 400
 *      when missing or invalid.
 *
 * `TenantGuard` is bypassed by providing a stub guard; the focus is
 * the controller's mapping logic, not the auth path (covered
 * separately in the tenant lib).
 */

const STUB_QUOTES: RankedRateQuote[] = [
  {
    carrier: 'Delhivery',
    carrierCode: 'DELHIVERY',
    serviceType: 'STANDARD',
    rate: 75.5,
    currency: 'INR',
    estimatedDays: { min: 2, max: 4 },
    codAvailable: true,
    pickupAvailable: true,
    expiresAt: new Date(),
    metadata: { breakdown: { base: 7000, fuel: 550 } },
    ranking: {
      position: 1,
      score: 1,
      costRank: 1,
      slaRank: 1,
      reliabilityRank: 1,
      effectiveCostPaise: 7550,
      expectedRtoLossPaise: 0,
    },
  } as unknown as RankedRateQuote,
  {
    carrier: 'Xpressbees',
    carrierCode: 'XPRESSBEES',
    serviceType: 'EXPRESS',
    rate: 90.0,
    currency: 'INR',
    estimatedDays: { min: 1, max: 2 },
    codAvailable: false,
    pickupAvailable: true,
    expiresAt: new Date(),
    ranking: {
      position: 2,
      score: 0.5,
      costRank: 2,
      slaRank: 1,
      reliabilityRank: 2,
      effectiveCostPaise: 9000,
      expectedRtoLossPaise: 0,
    },
  } as unknown as RankedRateQuote,
];

describe('RateShopPublicController', () => {
  let controller: RateShopPublicController;
  let rankSpy: jest.SpyInstance;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [RateShopPublicController],
      providers: [
        {
          provide: RateRankingService,
          useValue: {
            rank: jest.fn().mockResolvedValue(STUB_QUOTES),
          },
        },
      ],
    })
      // Bypass `TenantGuard` for unit-test scope.
      .overrideGuard(
        require('@swiftship/domains-tenants').TenantGuard,
      )
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(RateShopPublicController);
    rankSpy = moduleRef.get(RateRankingService).rank as jest.SpyInstance;
  });

  it('returns ranked quotes for a valid request', async () => {
    const out = await controller.rank(
      {
        originPincode: '110001',
        destinationPincode: '400001',
        weightGrams: 500,
        paymentMethod: 'PREPAID',
        strategy: 'best_value',
      },
      'demo_api_key',
    );

    expect(rankSpy).toHaveBeenCalledTimes(1);
    expect(rankSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        originPincode: '110001',
        destinationPincode: '400001',
        weightGrams: 500,
        paymentMethod: 'PREPAID',
      }),
      expect.objectContaining({ strategy: 'best_value' }),
    );
    expect(out.totalCandidates).toBe(2);
    expect(out.quotes[0]).toMatchObject({
      carrierCode: 'DELHIVERY',
      serviceType: 'STANDARD',
      ratePaise: 7550,
      rateInr: 75.5,
      codAvailable: true,
      etaDays: { min: 2, max: 4 },
    });
    // The second quote is the more expensive EXPRESS option.
    expect(out.quotes[1].ratePaise).toBe;
    expect(out.quotes[1].rateInr).toBe(90.0);
  });

  it('throws BadRequest when originPincode is missing', async () => {
    await expect(
      controller.rank(
        {
          originPincode: '',
          destinationPincode: '400001',
          weightGrams: 500,
        } as any,
        'k',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(rankSpy).not.toHaveBeenCalled();
  });

  it('throws BadRequest when destinationPincode is missing', async () => {
    await expect(
      controller.rank(
        {
          originPincode: '110001',
          destinationPincode: '',
          weightGrams: 500,
        } as any,
        'k',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(rankSpy).not.toHaveBeenCalled();
  });

  it('throws BadRequest when weightGrams is zero or negative', async () => {
    await expect(
      controller.rank(
        {
          originPincode: '110001',
          destinationPincode: '400001',
          weightGrams: 0,
        } as any,
        'k',
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controller.rank(
        {
          originPincode: '110001',
          destinationPincode: '400001',
          weightGrams: -5,
        } as any,
        'k',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(rankSpy).not.toHaveBeenCalled();
  });
});
