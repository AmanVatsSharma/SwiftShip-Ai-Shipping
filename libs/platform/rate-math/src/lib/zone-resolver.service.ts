import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PincodeZoneEntity,
  RateZoneMatrixEntity,
} from '@swiftship/platform-typeorm';

/**
 * ZoneLetter — the standard 5-tier zone classification used by Indian
 * carriers (A = metro/closest, E = remote/farthest). Letters, not
 * numbers, because that's the carrier convention.
 */
export type ZoneLetter = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * Default zone when a pincode isn't found. We default to 'D' (mid-tier)
 * because the alternative (throwing) would force every dev-time path to
 * populate the entire pincode_zones table. The 18% GST and 18% fuel
 * surcharges are computed against this base; the cart will still
 * surface the discrepancy to the merchant via the `metadata` block.
 */
const DEFAULT_ZONE: ZoneLetter = 'D';

/**
 * ZoneResolverService — translates pincodes into carrier zone letters
 * and looks up the 5×5 base-rate matrix.
 *
 * Two repos:
 *   1. `pincode_zones` — pincode → zone (A/B/C/D/E), populated by SS-001
 *   2. `rate_zone_matrix` — (carrier, originZone, destZone) → baseRatePaise
 *
 * The matrix is seeded with 13 carriers × 25 zone-pairs in migration
 * `1718160000003-AddRateZoneMatrix`. In production each carrier would
 * publish their own zone matrix; the seed is a placeholder for dev.
 */
@Injectable()
export class ZoneResolverService {
  constructor(
    @InjectRepository(PincodeZoneEntity)
    private readonly pincodeZoneRepo: Repository<PincodeZoneEntity>,
    @InjectRepository(RateZoneMatrixEntity)
    private readonly zoneMatrixRepo: Repository<RateZoneMatrixEntity>,
  ) {}

  /**
   * Resolve a single pincode to a zone letter.
   *
   * @param pincode      The pincode (6-digit Indian postal code)
   * @param carrierCode  The carrier code (kept for forward-compat;
   *                     current schema has pincode as the unique key,
   *                     so this is unused in the lookup today)
   * @returns            The zone letter, or 'D' (mid-tier) if not found
   */
  async resolveZone(pincode: string, carrierCode: string): Promise<ZoneLetter> {
    const row = await this.pincodeZoneRepo.findOne({
      where: { pincode },
    });
    return (row?.zone as ZoneLetter) ?? DEFAULT_ZONE;
  }

  /**
   * Resolve a (origin, dest) pair to (originZone, destZone). Used by
   * callers that want both letters in one trip.
   */
  async resolvePair(
    originPincode: string,
    destinationPincode: string,
    carrierCode: string,
  ): Promise<{ originZone: ZoneLetter; destinationZone: ZoneLetter }> {
    const [originZone, destinationZone] = await Promise.all([
      this.resolveZone(originPincode, carrierCode),
      this.resolveZone(destinationPincode, carrierCode),
    ]);
    return { originZone, destinationZone };
  }

  /**
   * Look up the base rate (paise) for a carrier + (origin, dest) zone
   * pair from the 5×5 zone matrix.
   *
   * @throws NotFoundException when no matrix cell is configured for
   *                           the (carrier, originZone, destZone) triple
   */
  async getBaseRateFromZoneMatrix(
    carrierCode: string,
    originZone: ZoneLetter,
    destZone: ZoneLetter,
  ): Promise<number> {
    const cell = await this.zoneMatrixRepo.findOne({
      where: { carrierCode, originZone, destZone },
    });
    if (!cell) {
      throw new NotFoundException(
        `No rate configured for ${carrierCode} ${originZone}->${destZone}`,
      );
    }
    return Number(cell.baseRatePaise);
  }
}
