import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PincodeZoneEntity } from '@swiftship/platform-typeorm';

/**
 * OdaSurchargeService — computes the ODA (Out-of-Delivery Area) surcharge.
 *
 * Background:
 *   ODA pincodes are delivery locations that the carrier cannot reach on
 *   their normal route. These are typically remote villages, islands, or
 *   hilly areas. Carriers charge an extra "ODA surcharge" (₹1-₹50) per
 *   shipment to cover the additional logistics cost.
 *
 * Data source:
 *   The `pincode_zones` table is owned by the SS-007 carrier adapter
 *   layer. It has a unique constraint on `pincode` (so one row per
 *   pincode, globally). Each row has an `oda` boolean flag that tells
 *   us whether it's out-of-delivery area.
 *
 * Carrier-specificity:
 *   The `pincode_zones` table has an optional `carrierId` / `carrier`
 *   relation, but since the pincode-level ODA designation is generally
 *   carrier-agnostic in India, we use the global (carrier-independent)
 *   lookup. The `carrierCode` parameter is kept in the signature for
 *   forward-compat and is used as a tenant-level hint if future migration
 *   adds per-carrier ODA tables.
 *
 * Currency: paise.
 * Current default surcharge: 100 paise = ₹1 (placeholder — can be
 * configured per-carrier later).
 */
@Injectable()
export class OdaSurchargeService {
  constructor(
    @InjectRepository(PincodeZoneEntity)
    private readonly pincodeZoneRepo: Repository<PincodeZoneEntity>,
  ) {}

  /**
   * Compute the ODA surcharge (paise) for a pair of pincodes.
   *
   * @param originPincode      Origin pincode
   * @param destinationPincode  Destination pincode
   * @param carrierCode        Carrier code (forward-compat; not yet used in lookup)
   * @returns                  100 paise if either pincode is ODA, else 0
   */
  async compute(
    originPincode: string,
    destinationPincode: string,
    carrierCode: string,
  ): Promise<number> {
    const isOda = await this.pincodeZoneRepo.findOne({
      where: {
        pincode: In([originPincode, destinationPincode]),
        oda: true,
      },
    });
    return isOda ? 100 : 0;
  }

  /**
   * Compute the ODA surcharge for a single pincode. Used by some
   * callers who only want to check the destination.
   */
  async computeForPincode(pincode: string, carrierCode: string): Promise<number> {
    const isOda = await this.pincodeZoneRepo.findOne({
      where: {
        pincode,
        oda: true,
      },
    });
    return isOda ? 100 : 0;
  }
}
