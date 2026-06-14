import { Repository } from 'typeorm';
import { PincodeZoneEntity } from '@swiftship/platform-typeorm';
import { OdaSurchargeService } from './oda-surcharge.service';

describe('OdaSurchargeService', () => {
  let service: OdaSurchargeService;
  let repo: jest.Mocked<Repository<PincodeZoneEntity>>;

  const mockOda = (pincode: string): PincodeZoneEntity => ({
    id: 1,
    pincode,
    zone: 'D',
    oda: true,
    carrierId: null,
    tenantId: 1,
    carrier: null,
  } as PincodeZoneEntity);

  const mockNormal = (pincode: string): PincodeZoneEntity => ({
    id: 2,
    pincode,
    zone: 'A',
    oda: false,
    carrierId: null,
    tenantId: 1,
    carrier: null,
  } as PincodeZoneEntity);

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<PincodeZoneEntity>>;

    // @ts-ignore - inject the mock
    service = new OdaSurchargeService(repo);
  });

  it('returns 100 paise when the destination pincode is ODA', async () => {
    repo.findOne.mockResolvedValueOnce(mockOda('560001'));
    const result = await service.compute('110001', '560001', 'DELHIVERY');
    expect(result).toEqual(100);
  });

  it('returns 100 paise when the origin pincode is ODA', async () => {
    repo.findOne.mockResolvedValueOnce(mockOda('110001'));
    const result = await service.compute('110001', '560001', 'DELHIVERY');
    expect(result).toEqual(100);
  });

  it('returns 0 when neither pincode is ODA', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    const result = await service.compute('110001', '560001', 'DELHIVERY');
    expect(result).toEqual(0);
  });

  it('returns 0 when both pincodes are ODA-free', async () => {
    repo.findOne.mockResolvedValueOnce(mockNormal('110001'));
    const result = await service.compute('110001', '560001', 'DELHIVERY');
    expect(result).toEqual(0);
  });

  it('calls the repo with an In clause containing both pincodes', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    await service.compute('110001', '560001', 'DELHIVERY');
    expect(repo.findOne).toHaveBeenCalledTimes(1);
    const callArg = repo.findOne.mock.calls[0][0];
    expect(callArg.where.pincode).toBeDefined();
    expect((callArg.where.pincode as string[]).sort()).toEqual(['110001', '560001']);
  });

  it('computeForPincode returns 100 for an ODA pincode', async () => {
    repo.findOne.mockResolvedValueOnce(mockOda('734001'));
    const result = await service.computeForPincode('734001', 'DELHIVERY');
    expect(result).toEqual(100);
  });

  it('computeForPincode returns 0 for a non-ODA pincode', async () => {
    repo.findOne.mockResolvedValueOnce(mockNormal('400001'));
    const result = await service.computeForPincode('400001', 'DELHIVERY');
    expect(result).toEqual(0);
  });
});
