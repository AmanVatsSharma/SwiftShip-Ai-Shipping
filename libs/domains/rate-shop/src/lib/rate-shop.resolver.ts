import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { TenantGuard } from '@swiftship/domains-tenants';
import { RateShopService } from '@swiftship/platform-rate-cache';
import type { RateQuoteRequest } from '@swiftship/platform-carriers';
import { ServiceabilityService } from './serviceability.service';
import {
  RateShopRequestInput,
  ServiceabilityParamsInput,
} from './rate-shop.input';
import {
  RateShopQuote,
  ServiceabilityCheckResult,
  projectQuoteForGql,
} from './rate-shop.model';

/**
 * RateShopResolver (SS-103 — TypeORM-native port)
 *
 * Restores the documented rate-shop + serviceability GraphQL surface
 * (READY_FEATURES.md):
 *
 *   rateShop(request)          — plain multi-carrier shop, NO ranking:
 *                                delegates to `RateShopService` from
 *                                `@swiftship/platform-rate-cache` (the
 *                                same engine `rankedRateShop` ranks on
 *                                top of).
 *   checkServiceability(params)— pincode-pair serviceability check via
 *                                `pincode_zones` + optional
 *                                `warehouse_coverage` lookup.
 *
 * The legacy resolver (`src/rate-shop/rate-shop.resolver.ts`) exposed a
 * single `rateShopDecision` query returning a JSON string; the documented
 * surface is `rateShop(request)` returning structured quotes, so this
 * port returns `[RateShopQuote]`.
 *
 * Guarded with `TenantGuard` — same convention as `RateRankingResolver`
 * (the rate cache keys quotes per tenant).
 */
@Resolver()
@UseGuards(TenantGuard)
export class RateShopResolver {
  constructor(
    private readonly shop: RateShopService,
    private readonly serviceability: ServiceabilityService,
  ) {}

  @Query(() => [RateShopQuote], {
    description:
      'Shop rates from every non-OPEN carrier (Redis cache + circuit ' +
      'breaker). Un-ranked — use rankedRateShop for strategy sorting.',
  })
  async rateShop(
    @Args('request', { type: () => RateShopRequestInput })
    request: RateShopRequestInput,
  ): Promise<RateShopQuote[]> {
    const req: RateQuoteRequest = {
      originPincode: request.originPincode,
      destinationPincode: request.destinationPincode,
      weightGrams: request.weightGrams,
      paymentMethod: request.paymentMethod ?? 'PREPAID',
      declaredValue: request.declaredValuePaise,
      length: request.lengthCm,
      width: request.widthCm,
      height: request.heightCm,
      courierCode: request.courierCode,
    };
    const quotes = await this.shop.shopRates(req);
    return quotes.map(projectQuoteForGql);
  }

  @Query(() => ServiceabilityCheckResult, {
    description:
      'Check serviceability for an origin/destination pincode pair. ' +
      'Serviceable only when both pincodes are mapped in pincode_zones; ' +
      'unknown pincodes are honestly reported as not serviceable.',
  })
  async checkServiceability(
    @Args('params', { type: () => ServiceabilityParamsInput })
    params: ServiceabilityParamsInput,
  ): Promise<ServiceabilityCheckResult> {
    return this.serviceability.check(params);
  }
}
