import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RateQuote,
  RateQuoteRequest,
} from '@swiftship/platform-carriers';
import { WeightBreakService } from './weight-break.service';
import { FuelSurchargeService } from './fuel-surcharge.service';
import { CodSurchargeService } from './cod-surcharge.service';
import { OdaSurchargeService } from './oda-surcharge.service';

/**
 * Standard Indian GST on logistics services. Per the spec this is
 * not configurable for SS-011 — the bead says 18% is the standard
 * rate. The orchestrator applies it on the pre-tax total (base +
 * fuel + COD + ODA), but NOT on the fuel surcharge itself in
 * some carriers' interpretation. We use the inclusive interpretation
 * (GST on the whole pre-tax amount) as the default since the spec
 * example "₹99 base + ₹18 fuel + ₹50 COD = ₹167 total" implies
 *   pre-tax = 99 + 18 + 50 = 167, then GST = 167 * 0.18 = 30.06
 *   total = 167 + 30.06 = 197.06
 * which is what we compute.
 */
const GST_RATE = 0.18;

/**
 * Default weight slab when a carrier-specific slab isn't configured.
 * 500g matches Delhivery (the most common Indian carrier).
 */
const DEFAULT_WEIGHT_SLAB_GRAMS = 500;

/**
 * RateMathService — the orchestrator that takes a carrier's base-rate
 * quote and applies all the surcharges on top.
 *
 *   finalRate = baseRate (pro-rated for weight break)
 *             + fuelSurchargePct * adjustedBaseRate
 *             + codSurcharge (only if paymentMethod === 'COD')
 *             + odaSurcharge (if either pincode is ODA)
 *             + gst (18% on the pre-tax total)
 *
 * The orchestrator does NOT do the zone matrix lookup — the carrier
 * adapter's `getRates` is responsible for returning the right base
 * rate for the (origin, dest, weight) triple. This lib just post-
 * processes that quote.
 *
 * Output: a new `RateQuote` with `rate` updated to the total and
 * `metadata.breakdown` populated with the per-surcharge amounts so
 * the merchant dashboard can show "₹99 base + ₹18 fuel + ₹50 COD
 * = ₹167 + ₹30 GST = ₹197 total".
 */
@Injectable()
export class RateMathService {
  private readonly logger = new Logger(RateMathService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly weightBreak: WeightBreakService,
    private readonly fuel: FuelSurchargeService,
    private readonly cod: CodSurchargeService,
    private readonly oda: OdaSurchargeService,
  ) {}

  /**
   * Apply all surcharges to a carrier's base-rate quote.
   *
   * @param quote  The carrier's base rate quote (see `RateQuote`).
   *               The `rate` field is treated as the base rate; on
   *               return it's replaced with the post-surcharge total.
   * @param req    The original `RateQuoteRequest` (we need weight
   *               for the weight break, payment method for COD, and
   *               pincodes for ODA).
   * @returns      A new `RateQuote` with `rate` updated and
   *               `metadata.breakdown` populated.
   */
  async applySurcharges(
    quote: RateQuote,
    req: RateQuoteRequest,
  ): Promise<RateQuote> {
    const carrierCode = quote.carrierCode;
    const baseRate = quote.rate;

    // 1. Weight break: round up the actual weight to the carrier's slab,
    //    then pro-rate the base rate proportionally. If the actual
    //    weight is already on the slab boundary the base rate is unchanged.
    const slab =
      this.config.get<number>(`WEIGHT_SLAB_${carrierCode.toUpperCase()}`) ??
      DEFAULT_WEIGHT_SLAB_GRAMS;
    const billableWeight = this.weightBreak.roundUpToSlab(req.weightGrams, slab);
    const adjustedBaseRate = Math.round(
      (baseRate * billableWeight) / Math.max(req.weightGrams, 1),
    );

    // 2. Fuel surcharge (pct of the adjusted base rate)
    const fuelSurcharge = this.fuel.compute(adjustedBaseRate, carrierCode);

    // 3. COD surcharge (flat or pct, only for COD shipments).
    //    Note: `RateQuoteRequest` doesn't carry `codAmount` directly —
    //    it lives on `PackageDetails` in the carrier adapter. We use
    //    `declaredValue` as a proxy for the COD amount when COD is
    //    requested; the rate-shop resolver will pass a more accurate
    //    value through a future overload of this method.
    const codSurcharge =
      req.paymentMethod === 'COD'
        ? this.cod.compute(req.declaredValue ?? 0, carrierCode)
        : 0;

    // 4. ODA surcharge
    const odaSurcharge = await this.oda.compute(
      req.originPincode,
      req.destinationPincode,
      carrierCode,
    );

    // 5. GST: 18% on the pre-tax total (base + fuel + COD + ODA)
    const preTaxTotal = adjustedBaseRate + fuelSurcharge + codSurcharge + odaSurcharge;
    const gst = Math.round(preTaxTotal * GST_RATE);
    const total = preTaxTotal + gst;

    return {
      ...quote,
      rate: total,
      metadata: {
        ...(quote.metadata ?? {}),
        breakdown: {
          billableWeightGrams: billableWeight,
          weightSlabGrams: slab,
          baseRate: adjustedBaseRate,
          fuelSurcharge,
          codSurcharge,
          odaSurcharge,
          gst,
          total,
        },
      },
    };
  }
}
