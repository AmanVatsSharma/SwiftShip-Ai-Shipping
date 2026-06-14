import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * CodSurchargeService — computes the COD (Cash on Delivery) surcharge.
 *
 * Default behavior:
 *   Most Indian carriers charge a flat ₹50 (5000 paise) per COD shipment,
 *   regardless of COD amount. Some (e.g. Delhivery above ₹5000 COD) charge
 *   1.5% of COD amount with a min/max clamp. We support both modes via
 *   the `COD_SURCHARGE_<CODE>` env var.
 *
 *   Shape: `{ flat?: number; pct?: number; min?: number; max?: number }`
 *     - If `pct` is set: compute `pct * codAmount`, clamp to [min, max].
 *     - Else: charge `flat` (or 50 paise... wait, 5000 paise = ₹50 default).
 *
 *   Note: the spec says "default ₹50 (or 5000 paise)" — that's the
 *   literal default in the bead. We use 5000 paise = ₹50.
 *
 * The service is called by the orchestrator only when `paymentMethod === 'COD'`.
 * For PREPAID, the orchestrator short-circuits and the surcharge is 0.
 */
@Injectable()
export class CodSurchargeService {
  private static readonly DEFAULT_FLAT_PAISE = 5000; // = ₹50

  constructor(private readonly config: ConfigService) {}

  /**
   * Compute the COD surcharge (paise) for a shipment.
   *
   * @param codAmount    The COD amount in paise (may be 0)
   * @param carrierCode  The carrier code, used to look up
   *                     `COD_SURCHARGE_<CODE>` env var (case-insensitive)
   * @returns            The COD surcharge in paise
   */
  compute(codAmount: number, carrierCode: string): number {
    const config = this.config.get<{
      flat?: number;
      pct?: number;
      min?: number;
      max?: number;
    }>(`COD_SURCHARGE_${carrierCode.toUpperCase()}`);

    if (config?.pct !== undefined && config.pct !== null) {
      const pctCharge = Math.round(codAmount * config.pct);
      const min = config.min ?? 0;
      const max = config.max ?? Number.POSITIVE_INFINITY;
      return Math.min(Math.max(pctCharge, min), max);
    }

    return config?.flat ?? CodSurchargeService.DEFAULT_FLAT_PAISE;
  }
}
