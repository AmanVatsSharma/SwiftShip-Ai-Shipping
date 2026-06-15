import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  CarrierEntity,
  NdrCaseEntity,
  ShipmentEntity,
  NdrCaseStatus,
} from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import { NdrAnalyticsService } from './ndr-analytics.service';
import { NdrAnalyticsFilter } from './ndr-analytics.input';

/**
 * SS-038 — `NdrAnalyticsService` unit tests.
 *
 * The aggregations are written in raw TypeORM `createQueryBuilder` SQL,
 * which is awkward to mock at the chain level. The cleanest pattern
 * (also used by `courier-score.service.spec.ts`) is to stub the chain
 * with a single fluent object that records the call sequence and
 * returns canned rows.
 *
 * Behaviors we assert (5 minimum from the bead, more if useful):
 *   1. Reason breakdown returns sorted by count desc
 *   2. Pincode breakdown respects limit
 *   3. Courier comparison includes all 13 carriers (zero-NDR too)
 *   4. Time-of-day returns 24-hour buckets (dense)
 *   5. Empty range returns empty array (not error)
 *   + tenant override is honored
 *   + COALESCE buckets NULL ndr_reason as "UNKNOWN"
 *   + recovery rate = recovered / count
 */
describe('NdrAnalyticsService', () => {
  let service: NdrAnalyticsService;
  let ndrs: { createQueryBuilder: jest.Mock };
  let shipments: { createQueryBuilder: jest.Mock };
  let carriers: { createQueryBuilder: jest.Mock };
  let tenantContext: { getTenantId: jest.Mock };

  const TENANT_ID = 7;

  /** Default filter: 30 days back, no tenant override. */
  const makeFilter = (
    overrides: Partial<NdrAnalyticsFilter> = {},
  ): NdrAnalyticsFilter => ({
    tenantId: undefined,
    range: {
      from: '2026-05-15T00:00:00.000Z',
      to: '2026-06-15T23:59:59.999Z',
    },
    ...overrides,
  });

  /**
   * Fluent query-builder stub. Each method returns the same object so
   * chains compose; the terminal method is configurable so each test
   * can return its own canned rows.
   */
  const buildQb = (terminal: () => Promise<unknown>) => {
    const qb: any = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      // setParameter is a void method in TypeORM — it doesn't return
      // the chain. The spec only needs to assert it was called with
      // the delivered-status parameter.
      setParameter: jest.fn(),
      getRawMany: terminal,
    };
    return qb;
  };

  beforeEach(async () => {
    ndrs = { createQueryBuilder: jest.fn() };
    shipments = { createQueryBuilder: jest.fn() };
    carriers = { createQueryBuilder: jest.fn() };
    tenantContext = { getTenantId: jest.fn(() => TENANT_ID) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NdrAnalyticsService,
        { provide: getRepositoryToken(NdrCaseEntity), useValue: ndrs },
        { provide: getRepositoryToken(ShipmentEntity), useValue: shipments },
        { provide: getRepositoryToken(CarrierEntity), useValue: carriers },
        { provide: TenantContext, useValue: tenantContext },
      ],
    }).compile();

    service = module.get<NdrAnalyticsService>(NdrAnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  //  reasons()
  // -------------------------------------------------------------------------

  it('reasons() returns rows sorted by count desc, with computed recoveryRate and avgAttempts', async () => {
    ndrs.createQueryBuilder.mockReturnValue(
      buildQb(async () => [
        { reason: 'CUSTOMER_UNAVAILABLE', count: '12', recovered: '4', avgAttempts: '1.5' },
        { reason: 'PHONE_BUSY',           count: '7',  recovered: '2', avgAttempts: '2.0' },
        { reason: 'ADDRESS_INCORRECT',    count: '3',  recovered: '0', avgAttempts: '3.0' },
      ]),
    );

    const result = await service.reasons(makeFilter());

    expect(result).toHaveLength(3);
    expect(result[0].reason).toBe('CUSTOMER_UNAVAILABLE');
    expect(result[0].count).toBe(12);
    expect(result[0].recoveryRate).toBeCloseTo(4 / 12, 5);
    expect(result[0].avgAttempts).toBeCloseTo(1.5, 5);
    // Sorted: count desc.
    expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
    expect(result[1].count).toBeGreaterThanOrEqual(result[2].count);
  });

  it('reasons() buckets NULL ndr_reason as "UNKNOWN" (via the COALESCE in SQL)', async () => {
    // The COALESCE happens in SQL — the service maps whatever the
    // driver returns. The spec asserts that whatever string comes
    // back, the row's `reason` field is the literal we passed.
    ndrs.createQueryBuilder.mockReturnValue(
      buildQb(async () => [
        { reason: 'UNKNOWN', count: '4', recovered: '0', avgAttempts: '1.0' },
      ]),
    );
    const result = await service.reasons(makeFilter());
    expect(result[0].reason).toBe('UNKNOWN');
  });

  it('reasons() empty range returns empty array (not an error)', async () => {
    ndrs.createQueryBuilder.mockReturnValue(buildQb(async () => []));
    const result = await service.reasons(makeFilter());
    expect(result).toEqual([]);
  });

  it('reasons() honors the tenantId override (platform-admin path)', async () => {
    ndrs.createQueryBuilder.mockReturnValue(buildQb(async () => []));
    await service.reasons(makeFilter({ tenantId: 99 }));
    // The QB was built — the inner .where() call must reference tenant 99.
    const qb = ndrs.createQueryBuilder.mock.results[0].value;
    expect(qb.where).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id'),
      expect.objectContaining({ tid: 99 }),
    );
  });

  it('reasons() respects the limit argument', async () => {
    ndrs.createQueryBuilder.mockReturnValue(buildQb(async () => []));
    await service.reasons(makeFilter(), 5);
    const qb = ndrs.createQueryBuilder.mock.results[0].value;
    expect(qb.limit).toHaveBeenCalledWith(5);
  });

  // -------------------------------------------------------------------------
  //  byPincode()
  // -------------------------------------------------------------------------

  it('byPincode() returns at most `limit` rows and computes ndrRate', async () => {
    // First QB: NDR group-by. Second QB: total shipments group-by.
    ndrs.createQueryBuilder.mockReturnValueOnce(
      buildQb(async () => [
        { pincode: '110001', ndrCount: '8' },
        { pincode: '560001', ndrCount: '5' },
      ]),
    );
    shipments.createQueryBuilder.mockReturnValue(
      buildQb(async () => [
        { pincode: '110001', total: '40' },
        { pincode: '560001', total: '25' },
      ]),
    );

    const result = await service.byPincode(makeFilter(), 2);

    expect(result).toHaveLength(2);
    expect(result[0].pincode).toBe('110001');
    expect(result[0].count).toBe(8);
    expect(result[0].ndrRate).toBeCloseTo(8 / 40, 5);
    // The NDR query must have used the requested limit.
    const pincodeQb = ndrs.createQueryBuilder.mock.results[0].value;
    expect(pincodeQb.limit).toHaveBeenCalledWith(2);
  });

  it('byPincode() returns empty when the NDR query is empty', async () => {
    ndrs.createQueryBuilder.mockReturnValueOnce(buildQb(async () => []));
    const result = await service.byPincode(makeFilter());
    expect(result).toEqual([]);
    // No second roundtrip when there's nothing to look up.
    expect(shipments.createQueryBuilder).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  //  byCourier()
  // -------------------------------------------------------------------------

  it('byCourier() includes all carriers (even with zero NDR) and computes ndrRate', async () => {
    // The service uses a chained .leftJoin(qb, alias, onCondition) — we
    // model that by just returning a single row of pre-aggregated
    // numbers. The shape that matters for the assertion is that the
    // service returns one row per active carrier in the registry.
    carriers.createQueryBuilder.mockReturnValue(
      buildQb(async () => [
        { courier: 'delhivery',   ndrCount: '20', totalShipments: '100' },
        { courier: 'xpressbees',  ndrCount: '5',  totalShipments: '60' },
        { courier: 'ecom-express', ndrCount: '0', totalShipments: '10' },
      ]),
    );

    const result = await service.byCourier(makeFilter());

    expect(result).toHaveLength(3);
    // Zero-NDR carrier still appears.
    const zero = result.find((r) => r.courier === 'ecom-express')!;
    expect(zero.count).toBe(0);
    expect(zero.ndrRate).toBe(0);
    // Non-zero NDR rate is correct.
    const delhivery = result.find((r) => r.courier === 'delhivery')!;
    expect(delhivery.ndrRate).toBeCloseTo(20 / 100, 5);
  });

  // -------------------------------------------------------------------------
  //  byTimeOfDay()
  // -------------------------------------------------------------------------

  it('byTimeOfDay() returns a dense 24-hour bucket list (no gaps)', async () => {
    // Simulate a sparse result: only a few hours have data.
    ndrs.createQueryBuilder.mockReturnValue(
      buildQb(async () => [
        { hour: '9',  count: '4' },
        { hour: '14', count: '11' },
        { hour: '22', count: '2' },
      ]),
    );

    const result = await service.byTimeOfDay(makeFilter());

    expect(result).toHaveLength(24);
    // Dense: every hour 0..23 is present.
    expect(result.map((b) => b.hour)).toEqual(
      Array.from({ length: 24 }, (_, i) => i),
    );
    // Sparse hours come back as 0, populated hours as their real value.
    expect(result[0].count).toBe(0);
    expect(result[9].count).toBe(4);
    expect(result[14].count).toBe(11);
    expect(result[22].count).toBe(2);
    expect(result[23].count).toBe(0);
  });

  it('byTimeOfDay() on empty range still returns 24 zero-buckets', async () => {
    ndrs.createQueryBuilder.mockReturnValue(buildQb(async () => []));
    const result = await service.byTimeOfDay(makeFilter());
    expect(result).toHaveLength(24);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });
});
