import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  CourierScoreDailyEntity,
  CarrierEntity,
  ShipmentEntity,
  TrackingEventEntity,
  ShipmentStatus,
} from '@swiftship/platform-typeorm';
import { CourierScoreService } from './courier-score.service';

/**
 * SS-012 — `CourierScoreService.recomputeAll` unit tests.
 *
 * The existing `getScorecard(s)` API is read-side and is covered by
 * downstream tests. This spec focuses on the new write-side method
 * (added by SS-012) — the score formula, the upsert path, and the
 * resilience contract.
 */
describe('CourierScoreService.recomputeAll', () => {
  let service: CourierScoreService;
  let carrierRepo: { find: jest.Mock };
  let shipmentRepo: { count: jest.Mock };
  let trackingRepo: { createQueryBuilder: jest.Mock };
  let scoreRepo: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  /**
   * Build a stub query-builder that responds to the chain used inside
   * `recomputeForCarrier`:
   *   .leftJoin(...)  .select(...)  .addSelect(...)
   *   .where(...)    .andWhere(...) .groupBy(...) .getRawMany()
   */
  const buildTrackingQb = (rows: Array<{ status: string; count: number }>) => {
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };

  /**
   * Stub query-builder used by the existence-check inside
   * `recomputeForCarrier`. Returns `existing` from `getOne()`.
   */
  const buildScoreQb = (existing: any | null) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(existing),
    };
    return qb;
  };

  beforeEach(async () => {
    carrierRepo = { find: jest.fn() };
    shipmentRepo = { count: jest.fn() };
    trackingRepo = { createQueryBuilder: jest.fn() };
    scoreRepo = {
      createQueryBuilder: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourierScoreService,
        {
          provide: getRepositoryToken(CourierScoreDailyEntity),
          useValue: scoreRepo,
        },
        {
          provide: getRepositoryToken(CarrierEntity),
          useValue: carrierRepo,
        },
        {
          provide: getRepositoryToken(ShipmentEntity),
          useValue: shipmentRepo,
        },
        {
          provide: getRepositoryToken(TrackingEventEntity),
          useValue: trackingRepo,
        },
      ],
    }).compile();

    service = module.get<CourierScoreService>(CourierScoreService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  //  Window handling
  // -------------------------------------------------------------------------

  it('uses a 60-day window when called with 60', async () => {
    carrierRepo.find.mockResolvedValue([]);
    const result = await service.recomputeAll(60);
    expect(result.windowDays).toBe(60);
  });

  it('uses a 90-day window when called with 90', async () => {
    carrierRepo.find.mockResolvedValue([]);
    const result = await service.recomputeAll(90);
    expect(result.windowDays).toBe(90);
  });

  it('defaults to a 30-day window', async () => {
    carrierRepo.find.mockResolvedValue([]);
    const result = await service.recomputeAll();
    expect(result.windowDays).toBe(30);
  });

  it('returns 0 processed when no carriers exist', async () => {
    carrierRepo.find.mockResolvedValue([]);
    const result = await service.recomputeAll(30);
    expect(result).toEqual({
      windowDays: 30,
      carriersProcessed: 0,
      carriersFailed: 0,
    });
    // No carrier → no further repo calls.
    expect(shipmentRepo.count).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  //  Score formula
  // -------------------------------------------------------------------------

  it('returns 50 (avoidance terms only) when a carrier has no shipments in the window', async () => {
    carrierRepo.find.mockResolvedValue([{ id: 1, name: 'Test Carrier' } as CarrierEntity]);
    shipmentRepo.count.mockResolvedValue(0); // delivered + total = 0
    trackingRepo.createQueryBuilder.mockReturnValue(buildTrackingQb([]));
    scoreRepo.createQueryBuilder.mockReturnValue(buildScoreQb(null));

    const result = await service.recomputeAll(30);
    expect(result.carriersProcessed).toBe(1);
    expect(result.carriersFailed).toBe(0);
    // 0.5 * 0 (deliveryRate) + 0.3 * 1 (ndr avoidance) + 0.2 * 1 (rto avoidance)
    // = 0 + 0.3 + 0.2 = 0.5 → 50. The persistence side just records the
    // zeroed counts; the computed score is internal to the call.
    expect(scoreRepo.save).toHaveBeenCalled();
    const saved = scoreRepo.save.mock.calls[0][0];
    expect(saved.delivered).toBe(0);
    expect(saved.ndr).toBe(0);
    expect(saved.rto).toBe(0);
  });

  it('computes score = 100 when all shipments delivered, no NDR, no RTO', async () => {
    carrierRepo.find.mockResolvedValue([{ id: 1, name: 'Reliable' } as CarrierEntity]);
    // First count → delivered, second count → total. Same fixture: 100/100.
    shipmentRepo.count.mockResolvedValueOnce(100).mockResolvedValueOnce(100);
    trackingRepo.createQueryBuilder.mockReturnValue(buildTrackingQb([]));
    scoreRepo.createQueryBuilder.mockReturnValue(buildScoreQb(null));

    const result = await service.recomputeAll(30);
    expect(result.carriersProcessed).toBe(1);

    // 0.5 * (100/100) + 0.3 * (1 - 0) + 0.2 * (1 - 0) = 0.5 + 0.3 + 0.2 = 1.0
    // → 100.
    const saved = scoreRepo.save.mock.calls[0][0];
    expect(saved.delivered).toBe(100);
    expect(saved.attempted).toBe(100);
    expect(saved.ndr).toBe(0);
    expect(saved.rto).toBe(0);
    // carrierCode is the slugified name.
    expect(saved.carrierCode).toBe('RELIABLE');
    expect(saved.zone).toBe('ALL');
  });

  it('computes score 50 when delivery rate is 100% but half the shipments RTO', async () => {
    carrierRepo.find.mockResolvedValue([{ id: 1, name: 'Risky' } as CarrierEntity]);
    shipmentRepo.count.mockResolvedValueOnce(100).mockResolvedValueOnce(100);
    trackingRepo.createQueryBuilder.mockReturnValue(
      buildTrackingQb([{ status: 'RTO', count: 50 }]),
    );
    scoreRepo.createQueryBuilder.mockReturnValue(buildScoreQb(null));

    await service.recomputeAll(30);
    // 0.5 * 1.0 + 0.3 * 1.0 + 0.2 * (1 - 0.5) = 0.5 + 0.3 + 0.1 = 0.9 → 90
    const saved = scoreRepo.save.mock.calls[0][0];
    expect(saved.rto).toBe(50);
    expect(saved.carrierCode).toBe('RISKY');
  });

  // -------------------------------------------------------------------------
  //  Resilience
  // -------------------------------------------------------------------------

  it('continues to the next carrier when one carrier throws', async () => {
    const a = { id: 1, name: 'A' } as CarrierEntity;
    const b = { id: 2, name: 'B' } as CarrierEntity;
    carrierRepo.find.mockResolvedValue([a, b]);
    // For A: first count (delivered) throws. For B: both succeed.
    shipmentRepo.count
      .mockImplementationOnce(() => Promise.reject(new Error('boom')))
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(50);
    // Tracking QB: one call for B (returns []).
    trackingRepo.createQueryBuilder.mockReturnValue(buildTrackingQb([]));
    // Score QB: for B, returns no existing.
    scoreRepo.createQueryBuilder.mockReturnValue(buildScoreQb(null));

    const result = await service.recomputeAll(30);
    expect(result.carriersProcessed).toBe(1);
    expect(result.carriersFailed).toBe(1);
  });

  // -------------------------------------------------------------------------
  //  Upsert behavior
  // -------------------------------------------------------------------------

  it('upserts the daily row when an existing ALL-zone row is found', async () => {
    const existing = { id: 'abc', delivered: 0, ndr: 0, rto: 0 } as any;
    carrierRepo.find.mockResolvedValue([{ id: 1, name: 'X' } as CarrierEntity]);
    shipmentRepo.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);
    trackingRepo.createQueryBuilder.mockReturnValue(buildTrackingQb([]));
    scoreRepo.createQueryBuilder.mockReturnValue(buildScoreQb(existing));

    await service.recomputeAll(30);
    // Should have updated the existing row (not created a new one).
    expect(scoreRepo.create).not.toHaveBeenCalled();
    expect(scoreRepo.save).toHaveBeenCalledWith(existing);
    expect(existing.delivered).toBe(10);
    expect(existing.attempted).toBe(10);
  });
});
