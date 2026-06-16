/**
 * SS-027 — tsoa RateShopController.
 *
 * Mirrors `apps/api/src/rate-shop/rate-shop.public.controller.ts` so
 * the embeddable rate-shop widget (and the new SDKs) can hit the
 * same `RateRankingService` the GraphQL app uses.
 */
import {
  Controller,
  Post,
  Body,
  Route,
  Security,
  Tags,
  SuccessResponse,
  Response,
} from 'tsoa';
import { Injectable, BadRequestException } from '@nestjs/common';
import {
  RateRankingService,
  RateRankingPreferences,
} from '@swiftship/domains-rate-shop';
import { RateQuoteRequest } from '@swiftship/platform-carriers';
import {
  RateShopRankRequestDto,
  RateShopRankResponse,
  PaymentMethod,
  RateStrategy,
} from './rate-shop.model';

@Injectable()
@Route('v1/rate-shop')
@Tags('Rate Shop')
@Security('api_key')
export class RateShopController extends Controller {
  constructor(private readonly ranker: RateRankingService) {
    super();
  }

  /**
   * Get ranked carrier quotes.
   */
  @Post('rank')
  @SuccessResponse('200', 'Ranked quotes')
  @Response<BadRequestException>(400, 'Invalid input')
  public async rank(@Body() body: RateShopRankRequestDto): Promise<RateShopRankResponse> {
    if (!body.originPincode) throw new BadRequestException('originPincode required');
    if (!body.destinationPincode)
      throw new BadRequestException('destinationPincode required');
    if (!body.weightGrams || body.weightGrams <= 0)
      throw new BadRequestException('weightGrams must be > 0');

    const req: RateQuoteRequest = {
      originPincode: body.originPincode,
      destinationPincode: body.destinationPincode,
      weightGrams: body.weightGrams,
      paymentMethod: (body.paymentMethod as PaymentMethod) ?? PaymentMethod.PREPAID,
    };
    const prefs: RateRankingPreferences = {
      strategy: (body.strategy as RateStrategy) ?? RateStrategy.BEST_VALUE,
      maxDeliveryDays: body.maxDeliveryDays,
      minCourierScore: body.minCourierScore,
      codAmountPaise: body.codAmountPaise,
    };

    const quotes = await this.ranker.rank(req, prefs);
    return {
      quotes: quotes.map((q) => ({
        carrierCode: q.carrierCode,
        serviceType: q.serviceType,
        ratePaise: Math.round(q.rate * 100),
        rateInr: q.rate,
        etaDays: q.estimatedDays,
        codAvailable: q.codAvailable,
        breakdown: q.metadata?.breakdown ?? undefined,
      })),
      totalCandidates: quotes.length,
    };
  }
}
