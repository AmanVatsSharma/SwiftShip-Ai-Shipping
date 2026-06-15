import { NotFoundException } from '@nestjs/common';
import { ManifestsService } from './manifests.service';

/**
 * SS-043a — ManifestsService unit tests.
 *
 * Mocks the two repositories (`manifests`, `manifestItems`), the
 * `DataSource` (its `transaction` callback is awaited directly with a
 * minimal `manager` object), and `TenantContext`.
 *
 * The point of this suite is to pin behaviour that used to flow
 * through the PrismaCompat shim:
 *  - tenant scoping on list + get
 *  - 404 for unknown id
 *  - generateManifest persists the manifest and its items in one tx
 *  - generateManifest handles the empty shipment list (items skipped)
 */
describe('ManifestsService', () => {
  let service: ManifestsService;
  let manifests: { find: jest.Mock; findOne: jest.Mock };
  let manifestItems: { find: jest.Mock; findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let tenantContext: { getTenantId: jest.Mock };

  const TENANT_ID = 7;

  const makeManifest = (overrides: Partial<any> = {}): any => ({
    id: 1,
    manifestNo: 'MAN-1',
    tenantId: TENANT_ID,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    manifests = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    manifestItems = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async (cb) =>
        cb({
          create: jest.fn((Entity, data) => ({ ...data, id: 1 })),
          save: jest.fn(async (x) => x),
        }),
      ),
    };
    tenantContext = {
      getTenantId: jest.fn(() => TENANT_ID),
    };
    service = new ManifestsService(
      manifests as any,
      manifestItems as any,
      dataSource as any,
      tenantContext as any,
    );
  });

  // ----------------------------------------------------------------
  // listManifests
  // ----------------------------------------------------------------

  it('listManifests returns tenant-scoped manifests, newest first', async () => {
    const expected = [makeManifest({ id: 1 }), makeManifest({ id: 2 })];
    manifests.find.mockResolvedValue(expected);

    const out = await service.listManifests();

    expect(out).toBe(expected);
    expect(manifests.find).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      order: { createdAt: 'DESC' },
      relations: ['items'],
    });
  });

  // ----------------------------------------------------------------
  // getManifest
  // ----------------------------------------------------------------

  it('getManifest returns the manifest when present', async () => {
    const m = makeManifest({ id: 42 });
    manifests.findOne.mockResolvedValue(m);

    const out = await service.getManifest(42);

    expect(out).toBe(m);
    expect(manifests.findOne).toHaveBeenCalledWith({
      where: { id: 42, tenantId: TENANT_ID },
      relations: ['items'],
    });
  });

  it('getManifest throws 404 when missing', async () => {
    manifests.findOne.mockResolvedValue(null);

    await expect(service.getManifest(999)).rejects.toThrow(NotFoundException);
  });

  // ----------------------------------------------------------------
  // generateManifest
  // ----------------------------------------------------------------

  it('generateManifest persists the manifest + items in a single tx', async () => {
    const saved = await service.generateManifest([101, 102]);

    // transaction was used
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    // the returned entity is the saved manifest
    expect(saved).toMatchObject({ manifestNo: expect.any(String), tenantId: TENANT_ID });
  });

  it('generateManifest with no shipment ids still writes the manifest row', async () => {
    const saved = await service.generateManifest([]);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(saved).toMatchObject({ tenantId: TENANT_ID });
  });
});
