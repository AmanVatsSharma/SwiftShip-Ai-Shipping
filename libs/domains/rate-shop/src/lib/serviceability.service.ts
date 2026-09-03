import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PincodeZoneEntity,
  WarehouseCoverageEntity,
} from '@swiftship/platform-typeorm';
import {
  ServiceabilityCheckResult,
  WarehouseCoverageInfo,
  ZoneInfo,
} from './rate-shop.model';

export interface ServiceabilityParams {
  originPincode: string;
  destinationPincode: string;
  warehouseId?: number;
}

/**
 * ServiceabilityService (TypeORM-native port, SS-103)
 *
 * Ported from the legacy `src/rate-shop/serviceability.service.ts`
 * (Prisma → TypeORM per MIGRATION.md §7):
 *
 *   prisma.pincodeZone.findUnique      → pincodeZones.findOne({ pincode })
 *   prisma.warehouseCoverage.findUnique→ warehouseCoverages.findOne({ warehouseId, pincode })
 *
 * Semantics (faithful to the legacy service, and deliberately honest):
 *
 *  - A pincode is "known" when a row exists in `pincode_zones`.
 *  - `serviceable` is true ONLY when both pincodes are known. When
 *    `pincode_zones` is empty (e.g. a fresh dev database) every check
 *    answers `serviceable: false` with null zone info — "unknown" is
 *    never reported as serviceable. Zone letters default to null here;
 *    the `ZoneResolverService` (platform/rate-math) is the component
 *    that applies the 'D' default for pricing.
 *  - Zone lookups are keyed by pincode only (not tenant-scoped), which
 *    matches `ZoneResolverService` semantics — pincode→zone is carrier
 *    reference data, not tenant data.
 *  - When `warehouseId` is passed, the `warehouse_coverage` row for the
 *    destination pincode is included (TAT days / ODA flag / ODA fee).
 *    That table has no tenant column; warehouse ownership is enforced
 *    by the warehouses domain at write time.
 */
@Injectable()
export class ServiceabilityService {
  constructor(
    @InjectRepository(PincodeZoneEntity)
    private readonly pincodeZones: Repository<PincodeZoneEntity>,
    @InjectRepository(WarehouseCoverageEntity)
    private readonly warehouseCoverages: Repository<WarehouseCoverageEntity>,
  ) {}

  async check(params: ServiceabilityParams): Promise<ServiceabilityCheckResult> {
    const { originPincode, destinationPincode, warehouseId } = params;
    if (!originPincode || !destinationPincode) {
      return { serviceable: false };
    }

    const [originZone, destinationZone, coverage] = await Promise.all([
      this.pincodeZones.findOne({ where: { pincode: originPincode } }),
      this.pincodeZones.findOne({ where: { pincode: destinationPincode } }),
      warehouseId
        ? this.warehouseCoverages.findOne({
            where: { warehouseId, pincode: destinationPincode },
          })
        : null,
    ]);

    const toZoneInfo = (z: PincodeZoneEntity | null): ZoneInfo | null =>
      z ? { pincode: z.pincode, zone: z.zone, oda: z.oda } : null;

    return {
      serviceable: Boolean(originZone && destinationZone),
      originZone: toZoneInfo(originZone),
      destinationZone: toZoneInfo(destinationZone),
      warehouseCoverage: this.mapCoverage(coverage),
    };
  }

  async isServiceable(
    originPincode: string,
    destinationPincode: string,
    warehouseId?: number,
  ): Promise<boolean> {
    const result = await this.check({
      originPincode,
      destinationPincode,
      warehouseId,
    });
    return result.serviceable;
  }

  private mapCoverage(
    coverage: WarehouseCoverageEntity | null,
  ): WarehouseCoverageInfo | null {
    if (!coverage) return null;
    return {
      warehouseId: coverage.warehouseId,
      pincode: coverage.pincode,
      tatDays: coverage.tatDays,
      isOda: coverage.isOda,
      odaFee: coverage.odaFee,
    };
  }
}
