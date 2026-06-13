import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { ServiceabilityService } from './serviceability.service';

export interface RateShopRequest {
  originPincode: string;
  destinationPincode: string;
  weightGrams: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  warehouseId?: number;
  preferences?: {
    weightCost?: number; // weight for cost optimization (0..1)
    weightSla?: number; // weight for SLA optimization (0..1)
    preferredCarriers?: string[];
  };
}

export interface RateShopDecision {
  carrierId: number;
  carrierName: string;
  rateId: number;
  serviceName: string;
  price: number;
  etaDays: number;
  score: number;
}

@Injectable()
export class RateShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceability: ServiceabilityService,
    private readonly metrics: MetricsService,
  ) {}

  private volumetricWeightKg(
    lengthCm?: number,
    widthCm?: number,
    heightCm?: number,
  ) {
    if (!lengthCm || !widthCm || !heightCm) return 0;
    return (lengthCm * widthCm * heightCm) / 5000 / 1000; // industry divisor 5000
  }

  async shop(input: RateShopRequest): Promise<RateShopDecision | null> {
    const serviceability = await this.serviceability.check({
      originPincode: input.originPincode,
      destinationPincode: input.destinationPincode,
      warehouseId: input.warehouseId,
    });
    if (!serviceability.serviceable) return null;

    const physicalKg = input.weightGrams / 1000;
    const volumetricKg = this.volumetricWeightKg(
      input.lengthCm,
      input.widthCm,
      input.heightCm,
    );
    const chargeableKg = Math.max(physicalKg, volumetricKg || 0.0);

    const rates = await this.prisma.shippingRate.findMany({
      include: {
        carrier: { include: { surcharges: { where: { active: true } } } },
      },
    });
    if (rates.length === 0) return null;

    const pref = {
      weightCost: 0.6,
      weightSla: 0.4,
      preferredCarriers: [] as string[],
      ...(input.preferences || {}),
    };

    const isOdaDestination = Boolean(
      serviceability.destinationZone?.oda ||
        serviceability.warehouseCoverage?.isOda,
    );
    const odaFee = serviceability.warehouseCoverage?.odaFee ?? 0;
    const coverageTat = serviceability.warehouseCoverage?.tatDays;

    const scored = rates.map((r) => {
      let price = r.rate * Math.max(1, Math.ceil(chargeableKg));
      // apply surcharges
      let odaHandled = false;
      (r.carrier.surcharges || []).forEach((s) => {
        const label = (s.name || '').toLowerCase();
        const isOdaSurcharge = label.includes('oda');
        if (isOdaSurcharge) {
          if (isOdaDestination) {
            if (s.percent) price += price * (s.percent / 100);
            if (s.flat) price += s.flat;
            odaHandled = true;
          }
          return;
        }
        if (s.percent) price += price * (s.percent / 100);
        if (s.flat) price += s.flat;
      });

      if (isOdaDestination && !odaHandled && odaFee) {
        price += odaFee;
      }

      const sla = coverageTat ?? r.estimatedDeliveryDays;
      const costScore = price; // lower better
      const slaScore = sla; // lower better
      let combined = pref.weightCost * costScore + pref.weightSla * slaScore;
      if (pref.preferredCarriers?.includes(r.carrier.name)) combined *= 0.9;
      return { r, price, combined };
    });

    scored.sort((a, b) => a.combined - b.combined);
    const best = scored[0];
    this.metrics.inc('rate_shop_decisions');
    return {
      carrierId: best.r.carrierId,
      carrierName: best.r.carrier.name,
      rateId: best.r.id,
      serviceName: best.r.serviceName,
      price: best.price,
      etaDays: coverageTat ?? best.r.estimatedDeliveryDays,
      score: best.combined,
    };
  }
}
