import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { TenantGuard } from '@swiftship/domains-tenants';
// Direct file import (not the `@swiftship/domains-rate-shop` barrel) so the
// legacy `src/rate-shop` re-exports stay out of the app's runtime graph —
// see STATUS.md §3 (src-to-libs decommission).
import {
  RateRankingService,
  RateRankingPreferences,
} from '../../../../libs/domains/rate-shop/src/lib/rate-ranking/rate-ranking.service';
import { RateQuoteRequest } from '@swiftship/platform-carriers';

/**
 * Public REST shape accepted by the embeddable widget. Kept
 * intentionally flat — every field maps 1:1 to a `RateQuoteRequest` +
 * `RateRankingPreferences` knob on the internal ranker.
 */
interface RateShopPublicRequest {
  originPincode: string;
  destinationPincode: string;
  weightGrams: number;
  paymentMethod?: 'PREPAID' | 'COD';
  strategy?: 'cheapest' | 'fastest' | 'best_value' | 'balanced' | 'reliability_first';
  maxDeliveryDays?: number;
  minCourierScore?: number;
  codAmountPaise?: number;
}

/**
 * SS-014: Public rate-shop controller.
 *
 * Exposes the internal `RateRankingService` to the outside world
 * via a JWT-less REST endpoint protected by `TenantGuard`. The
 * tenant id is resolved from the `X-Swiftship-Api-Key` header by
 * the `TenantMiddleware` (wired in `@swiftship/domains-tenants`).
 *
 * No new ranking logic lives here — this is a thin adapter that
 * maps the public wire shape to the ranker's typed inputs.
 */
@ApiTags('Public Rate Shop')
@Controller('api/v1/rate-shop')
export class RateShopPublicController {
  constructor(private readonly ranker: RateRankingService) {}

  @Post('rank')
  @UseGuards(TenantGuard)
  @ApiHeader({ name: 'X-Swiftship-Api-Key', description: 'Merchant API key' })
  @ApiOperation({ summary: 'Get ranked carrier quotes' })
  async rank(
    @Body() body: RateShopPublicRequest,
    @Headers('x-swiftship-api-key') _key: string,
  ) {
    if (!body.originPincode) {
      throw new BadRequestException('originPincode required');
    }
    if (!body.destinationPincode) {
      throw new BadRequestException('destinationPincode required');
    }
    if (!body.weightGrams || body.weightGrams <= 0) {
      throw new BadRequestException('weightGrams must be > 0');
    }

    const req: RateQuoteRequest = {
      originPincode: body.originPincode,
      destinationPincode: body.destinationPincode,
      weightGrams: body.weightGrams,
      paymentMethod: body.paymentMethod ?? 'PREPAID',
    };
    const prefs: RateRankingPreferences = {
      strategy: body.strategy ?? 'best_value',
      maxDeliveryDays: body.maxDeliveryDays,
      minCourierScore: body.minCourierScore,
      codAmountPaise: body.codAmountPaise,
    };

    const quotes = await this.ranker.rank(req, prefs);
    return {
      quotes: quotes.map((q) => ({
        carrierCode: q.carrierCode,
        serviceType: q.serviceType,
        // `RateQuote.rate` is INR; the widget wants both paise and
        // INR for convenience — paise is computed at the API
        // boundary so JS callers never lose precision.
        ratePaise: Math.round(q.rate * 100),
        rateInr: q.rate,
        etaDays: q.estimatedDays,
        codAvailable: q.codAvailable,
        breakdown: q.metadata?.breakdown ?? null,
      })),
      totalCandidates: quotes.length,
    };
  }
}
