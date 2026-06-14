import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * WeightBreakService — rounds a shipment's actual weight up to the nearest
 * "weight break" or slab boundary that the carrier bills.
 *
 * Why this exists:
 *   Carriers bill in discrete slabs (e.g. Delhivery rounds to 500g, India Post
 *   to 50g, DHL to 1kg). A 450g shipment with Delhivery is billed as 500g.
 *   Different carriers use different slab sizes; the size is per-carrier
 *   config, sourced from the carrier adapter or the `WEIGHT_SLAB_<CODE>` env
 *   var (default 500g).
 *
 * The actual math is just `Math.ceil(weight / slab) * slab` — the lib
 * deliberately keeps this synchronous and pure so it can be called from any
 * code path (resolver, worker, REST) without DI ceremony.
 */
@Injectable()
export class WeightBreakService {
  /**
   * Round up a shipment weight to the nearest slab boundary.
   * Returns the weight to be billed in grams.
   *
   * @param weightGrams  Actual shipment weight in grams (>= 0)
   * @param slabSizeGrams The carrier's billing slab in grams (must be > 0)
   * @returns The rounded-up billable weight in grams (multiple of slabSizeGrams)
   * @throws BadRequestException if `slabSizeGrams <= 0`
   */
  roundUpToSlab(weightGrams: number, slabSizeGrams: number): number {
    if (slabSizeGrams <= 0) {
      throw new BadRequestException('slabSizeGrams must be > 0');
    }
    if (!Number.isFinite(weightGrams) || weightGrams <= 0) {
      // A 0g or negative weight is nonsense, but we don't reject at this
      // layer — that's the caller's responsibility. We just round to the
      // first slab so downstream math doesn't divide by zero.
      return slabSizeGrams;
    }
    return Math.ceil(weightGrams / slabSizeGrams) * slabSizeGrams;
  }
}
