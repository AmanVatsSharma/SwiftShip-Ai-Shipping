import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ServiceabilityParams {
  originPincode: string;
  destinationPincode: string;
  warehouseId?: number;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  originZone?: { pincode: string; zone?: string | null; oda?: boolean };
  destinationZone?: { pincode: string; zone?: string | null; oda?: boolean };
  warehouseCoverage?: {
    warehouseId: number;
    pincode: string;
    tatDays?: number | null;
    isOda: boolean;
    odaFee?: number | null;
  } | null;
}

@Injectable()
export class ServiceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async check(params: ServiceabilityParams): Promise<ServiceabilityResult> {
    const { originPincode, destinationPincode, warehouseId } = params;
    if (!originPincode || !destinationPincode) {
      return { serviceable: false };
    }

    const [originZone, destinationZone, coverage] = await Promise.all([
      this.prisma.pincodeZone.findUnique({ where: { pincode: originPincode } }),
      this.prisma.pincodeZone.findUnique({
        where: { pincode: destinationPincode },
      }),
      warehouseId
        ? this.prisma.warehouseCoverage.findUnique({
            where: {
              warehouseId_pincode: {
                warehouseId,
                pincode: destinationPincode,
              },
            },
          })
        : null,
    ]);

    if (!originZone || !destinationZone) {
      return {
        serviceable: false,
        originZone: originZone
          ? {
              pincode: originZone.pincode,
              zone: originZone.zone,
              oda: originZone.oda,
            }
          : undefined,
        destinationZone: destinationZone
          ? {
              pincode: destinationZone.pincode,
              zone: destinationZone.zone,
              oda: destinationZone.oda,
            }
          : undefined,
        warehouseCoverage: coverage ? this.mapCoverage(coverage) : null,
      };
    }

    return {
      serviceable: true,
      originZone: {
        pincode: originZone.pincode,
        zone: originZone.zone,
        oda: originZone.oda,
      },
      destinationZone: {
        pincode: destinationZone.pincode,
        zone: destinationZone.zone,
        oda: destinationZone.oda,
      },
      warehouseCoverage: coverage ? this.mapCoverage(coverage) : null,
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

  private mapCoverage(coverage: any) {
    return {
      warehouseId: coverage.warehouseId,
      pincode: coverage.pincode,
      tatDays: coverage.tatDays,
      isOda: coverage.isOda,
      odaFee: coverage.odaFee,
    };
  }
}
