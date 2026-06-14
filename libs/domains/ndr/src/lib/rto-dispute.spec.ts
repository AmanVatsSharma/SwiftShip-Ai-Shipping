import { BadRequestException } from '@nestjs/common';
import { RtoDisputeResolver } from './rto-dispute.resolver';
import { RtoDisputeStatus } from './rto-dispute.model';

/**
 * SS-019 — RtoDisputeResolver unit tests.
 *
 * Drives the resolver's branch logic:
 *  - openRtoDisputes / rtoDisputesByTenant / rtoDispute queries
 *  - resolveRtoDispute mutation (CARRIER_FAULT vs MERCHANT_FAULT paths)
 *  - input validation (status whitelist, resolution required)
 */
describe('RtoDisputeResolver', () => {
  let resolver: RtoDisputeResolver;
  let disputes: {
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  const TENANT_ID = 7;
  const DISPUTE_ID = 42;

  beforeEach(() => {
    disputes = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    resolver = new RtoDisputeResolver(disputes as any);
  });

  // ----------------------------------------------------------------
  // Queries
  // ----------------------------------------------------------------

  it('openRtoDisputes filters by tenantId and status=OPEN', async () => {
    await resolver.openRtoDisputes(TENANT_ID);
    expect(disputes.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, status: RtoDisputeStatus.OPEN },
        order: { openedAt: 'DESC' },
      }),
    );
  });

  it('rtoDisputesByTenant returns all disputes for a tenant', async () => {
    await resolver.rtoDisputesByTenant(TENANT_ID);
    expect(disputes.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
      }),
    );
  });

  it('rtoDispute returns a single dispute by id', async () => {
    disputes.findOne.mockResolvedValue({ id: DISPUTE_ID });
    const r = await resolver.rtoDispute(DISPUTE_ID);
    expect(r).toEqual({ id: DISPUTE_ID });
    expect(disputes.findOne).toHaveBeenCalledWith({
      where: { id: DISPUTE_ID },
    });
  });

  it('rtoDispute returns null when not found', async () => {
    disputes.findOne.mockResolvedValue(null);
    const r = await resolver.rtoDispute(DISPUTE_ID);
    expect(r).toBeNull();
  });

  // ----------------------------------------------------------------
  // resolveRtoDispute mutation
  // ----------------------------------------------------------------

  it('resolveRtoDispute (CARRIER_FAULT) sets status, resolution, refundedPaise', async () => {
    disputes.findOne
      .mockResolvedValueOnce({ id: DISPUTE_ID })
      .mockResolvedValueOnce({
        id: DISPUTE_ID,
        status: 'RESOLVED_CARRIER_FAULT',
        resolution: 'driver did not attempt',
        refundedPaise: 50000,
        resolvedAt: expect.any(Date),
      });

    const r = await resolver.resolveRtoDispute(
      DISPUTE_ID,
      'RESOLVED_CARRIER_FAULT',
      'driver did not attempt',
      50000,
    );

    expect(disputes.update).toHaveBeenCalledWith(
      { id: DISPUTE_ID },
      expect.objectContaining({
        status: 'RESOLVED_CARRIER_FAULT',
        resolution: 'driver did not attempt',
        refundedPaise: 50000,
        resolvedAt: expect.any(Date),
      }),
    );
    expect(r?.status).toBe('RESOLVED_CARRIER_FAULT');
    expect(r?.refundedPaise).toBe(50000);
  });

  it('resolveRtoDispute (MERCHANT_FAULT) sets status but not refundedPaise', async () => {
    disputes.findOne
      .mockResolvedValueOnce({ id: DISPUTE_ID })
      .mockResolvedValueOnce({
        id: DISPUTE_ID,
        status: 'RESOLVED_MERCHANT_FAULT',
        resolution: 'wrong address',
        refundedPaise: null,
      });

    const r = await resolver.resolveRtoDispute(
      DISPUTE_ID,
      'RESOLVED_MERCHANT_FAULT',
      'wrong address',
      undefined,
    );

    expect(disputes.update).toHaveBeenCalledWith(
      { id: DISPUTE_ID },
      expect.objectContaining({
        status: 'RESOLVED_MERCHANT_FAULT',
        resolution: 'wrong address',
        refundedPaise: null,
        resolvedAt: expect.any(Date),
      }),
    );
    expect(r?.status).toBe('RESOLVED_MERCHANT_FAULT');
    expect(r?.refundedPaise).toBeNull();
  });

  it('resolveRtoDispute (REJECTED) sets status to REJECTED', async () => {
    disputes.findOne
      .mockResolvedValueOnce({ id: DISPUTE_ID })
      .mockResolvedValueOnce({
        id: DISPUTE_ID,
        status: 'REJECTED',
        resolution: 'duplicate dispute',
      });

    await resolver.resolveRtoDispute(
      DISPUTE_ID,
      'REJECTED',
      'duplicate dispute',
    );

    expect(disputes.update).toHaveBeenCalledWith(
      { id: DISPUTE_ID },
      expect.objectContaining({
        status: 'REJECTED',
        resolution: 'duplicate dispute',
      }),
    );
  });

  // ----------------------------------------------------------------
  // Validation
  // ----------------------------------------------------------------

  it('resolveRtoDispute throws 400 when resolution is empty', async () => {
    await expect(
      resolver.resolveRtoDispute(
        DISPUTE_ID,
        'RESOLVED_CARRIER_FAULT',
        '   ',
        100,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolveRtoDispute throws 400 on invalid status', async () => {
    await expect(
      resolver.resolveRtoDispute(
        DISPUTE_ID,
        'OPEN' as any,
        'invalid status',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
