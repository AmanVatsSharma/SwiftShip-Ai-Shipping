import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderRateQuoteEntity } from '@swiftship/platform-typeorm';
import { RankedRateQuote } from '@swiftship/domains-rate-shop';
import { TenantContext } from '@swiftship/domains-tenants';

/**
 * SS-015: persists the full ranked-quote list produced by the rate-engine
 * at order-creation time. One row per ranked carrier, so the merchant
 * can later replay the ranking or drill into "why was this carrier picked".
 */
@Injectable()
export class OrderRateQuoteService {
  constructor(
    @InjectRepository(OrderRateQuoteEntity)
    private readonly quotes: Repository<OrderRateQuoteEntity>,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Record the complete ranked list for an order. `ranked[0]` is the
   * winner the auto-pick chose.
   */
  async recordRankedQuotes(
    orderId: number,
    ranked: RankedRateQuote[],
  ): Promise<void> {
    const tenantId = this.tenantContext.getTenantId();
    const tid = tenantId != null ? Number(tenantId) : 1;

    const records = ranked.map((q, i) =>
      this.quotes.create({
        orderId,
        tenantId: tid,
        carrierCode: q.carrierCode,
        // serviceType is a string union in RateQuote; store the raw value.
        serviceType: q.serviceType,
        ratePaise: q.rate,
        etaDaysMin: q.estimatedDays.min,
        etaDaysMax: q.estimatedDays.max,
        position: i + 1,
        rankingScore: q.ranking.score,
        effectiveCostPaise: q.ranking.effectiveCostPaise,
        expectedRtoLossPaise: q.ranking.expectedRtoLossPaise,
        fullQuote: q,
      }),
    );

    await this.quotes.save(records);
  }
}
