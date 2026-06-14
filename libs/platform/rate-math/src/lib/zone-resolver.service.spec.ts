import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  PincodeZoneEntity,
  RateZoneMatrixEntity,
} from '@swiftship/platform-typeorm';
import { ZoneResolverService } from './zone-resolver.service';

describe('ZoneResolverService', () => {
  let service: ZoneResolverService;
  let pincodeRepo: jest.Mocked<Repository<PincodeZoneEntity>>;
  let matrixRepo: jest.Mocked<Repository<RateZoneMatrixEntity>>;

  beforeEach(() => {
    pincodeRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<PincodeZoneEntity>>;

    matrixRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<RateZoneMatrixEntity>>;

    // @ts-ignore - mock injection
    service = new ZoneResolverService(pincodeRepo, matrixRepo);
  });

  describe('resolveZone', () => {
    it('returns the zone from the pincode_zones table when found', async () => {
      pincodeRepo.findOne.mockResolvedValueOnce({
        id: 1,
        pincode: '110001',
        zone: 'A',
        oda: false,
        carrierId: null,
        tenantId: 1,
        carrier: null,
      } as PincodeZoneEntity);

      const result = await service.resolveZone('110001', 'DELHIVERY');
      expect(result).toEqual('A');
    });

    it('falls back to D when the pincode is not in the table', async () => {
      pincodeRepo.findOne.mockResolvedValueOnce(null);
      const result = await service.resolveZone('999999', 'DELHIVERY');
      expect(result).toEqual('D');
    });

    it('accepts any of the 5 zone letters (A, B, C, D, E)', async () => {
      for (const zone of ['A', 'B', 'C', 'D', 'E'] as const) {
        pincodeRepo.findOne.mockResolvedValueOnce({
          id: 1,
          pincode: '110001',
          zone,
          oda: false,
          carrierId: null,
          tenantId: 1,
          carrier: null,
        } as PincodeZoneEntity);
        // eslint-disable-next-line no-await-in-loop
        const result = await service.resolveZone('110001', 'DELHIVERY');
        expect(result).toEqual(zone);
      }
    });
  });

  describe('resolvePair', () => {
    it('returns both zones in one call (parallel)', async () => {
      pincodeRepo.findOne
        .mockResolvedValueOnce({ id: 1, pincode: '110001', zone: 'A', oda: false, carrierId: null, tenantId: 1, carrier: null } as PincodeZoneEntity)
        .mockResolvedValueOnce({ id: 2, pincode: '560001', zone: 'C', oda: false, carrierId: null, tenantId: 1, carrier: null } as PincodeZoneEntity);
      const result = await service.resolvePair('110001', '560001', 'DELHIVERY');
      expect(result).toEqual({ originZone: 'A', destinationZone: 'C' });
    });
  });

  describe('getBaseRateFromZoneMatrix', () => {
    it('returns the base rate (paise) from the matrix cell', async () => {
      matrixRepo.findOne.mockResolvedValueOnce({
        id: 1,
        carrierCode: 'DELHIVERY',
        originZone: 'A',
        destZone: 'B',
        baseRatePaise: '9900',
        weightSlabGrams: 500,
        tenantId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RateZoneMatrixEntity);

      const result = await service.getBaseRateFromZoneMatrix('DELHIVERY', 'A', 'B');
      expect(result).toEqual(9900);
    });

    it('throws NotFoundException when the cell is missing', async () => {
      matrixRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.getBaseRateFromZoneMatrix('DELHIVERY', 'A', 'B'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
