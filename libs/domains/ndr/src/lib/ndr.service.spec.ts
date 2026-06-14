import { NotFoundException } from '@nestjs/common';
import { NdrCaseStatus, ShipmentStatus } from '@swiftship/platform-typeorm';
import { NdrService } from './ndr.service';
import { NdrStateMachine } from './ndr-state-machine.service';

/**
 * SS-017 — NdrService unit tests.
 *
 * Mocks the two repositories (`ndrs`, `shipments`) and the
 * `TenantContext` so we can drive the service's branch logic:
 *  - tenant isolation on reads
 *  - 404 for unknown id
 *  - idempotent create
 *  - transition integration with the state machine
 *  - RTO updates the parent shipment
 *
 * SS-019 — NdrService.initiateRto now also fires the RTO settlement
 * cascade. The settlement is stubbed in this spec — the cascade is
 * tested in `rto-settlement.service.spec.ts`.
 */
describe('NdrService', () => {
  let service: NdrService;
  let ndrs: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update?: jest.Mock;
  };
  let shipments: {
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let tenantContext: { getTenantId: jest.Mock };
  let rtoSettlement: { onShipmentRto: jest.Mock };

  const TENANT_ID = 7;

  const makeShipment = (overrides: Partial<any> = {}): any => ({
    id: 101,
    trackingNumber: 'AWB-101',
    courierName: 'Delhivery',
    customerPhone: '+91-90000-00001',
    customerEmail: 'cust@example.com',
    customerName: 'Cust One',
    status: ShipmentStatus.IN_TRANSIT,
    ...overrides,
  });

  const makeNdr = (overrides: Partial<any> = {}): any => ({
    id: 1,
    shipmentId: 101,
    tenantId: TENANT_ID,
    status: NdrCaseStatus.PENDING,
    awbNumber: 'AWB-101',
    courierName: 'Delhivery',
    customerPhone: '+91-90000-00001',
    customerEmail: 'cust@example.com',
    customerName: 'Cust One',
    ndrReason: 'NOT_DELIVERED',
    firstAttemptAt: new Date(),
    lastAttemptAt: null,
    attemptCount: 0,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    ndrs = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((x) => ({ id: 1, ...x })),
      save: jest.fn(async (x) => x),
    };
    shipments = {
      findOne: jest.fn(),
      update: jest.fn(async () => ({})),
    };
    tenantContext = {
      getTenantId: jest.fn(() => TENANT_ID),
    };
    rtoSettlement = {
      onShipmentRto: jest.fn().mockResolvedValue(undefined),
    };
    service = new NdrService(
      ndrs as any,
      shipments as any,
      new NdrStateMachine(),
      tenantContext as any,
      rtoSettlement as any,
    );
  });

  // ----------------------------------------------------------------
  // getNdr
  // ----------------------------------------------------------------

  it('getNdr returns the case scoped to the tenant', async () => {
    ndrs.findOne.mockResolvedValue(makeNdr());
    const r = await service.getNdr(1);
    expect(r.id).toBe(1);
    expect(ndrs.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, tenantId: TENANT_ID } }),
    );
  });

  it('getNdr throws 404 when not found', async () => {
    ndrs.findOne.mockResolvedValue(null);
    await expect(service.getNdr(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ----------------------------------------------------------------
  // getNdrs (list)
  // ----------------------------------------------------------------

  it('getNdrs returns the tenant-scoped list', async () => {
    ndrs.find.mockResolvedValue([makeNdr({ id: 1 }), makeNdr({ id: 2 })]);
    const list = await service.getNdrs();
    expect(list).toHaveLength(2);
    expect(ndrs.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_ID } }),
    );
  });

  // ----------------------------------------------------------------
  // createNdrFromTracking (idempotent)
  // ----------------------------------------------------------------

  it('createNdrFromTracking is idempotent — returns existing case if one exists', async () => {
    const existing = makeNdr();
    ndrs.findOne.mockResolvedValue(existing);
    const result = await service.createNdrFromTracking(makeShipment(), 'NOT_DELIVERED');
    expect(result).toBe(existing);
    expect(ndrs.create).not.toHaveBeenCalled();
  });

  it('createNdrFromTracking creates a fresh PENDING case on first call', async () => {
    ndrs.findOne.mockResolvedValue(null);
    const created = makeNdr({ id: 99 });
    ndrs.create.mockReturnValue(created);
    const result = await service.createNdrFromTracking(makeShipment(), 'NOT_DELIVERED');
    expect(ndrs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shipmentId: 101,
        tenantId: TENANT_ID,
        status: NdrCaseStatus.PENDING,
        ndrReason: 'NOT_DELIVERED',
        attemptCount: 0,
      }),
    );
    expect(ndrs.save).toHaveBeenCalledWith(created);
  });

  // ----------------------------------------------------------------
  // transitionNdr
  // ----------------------------------------------------------------

  it('transitionNdr updates the status via the state machine', async () => {
    const ndr = makeNdr({ status: NdrCaseStatus.PENDING });
    ndrs.findOne.mockResolvedValue(ndr);
    const updated = await service.transitionNdr(1, NdrCaseStatus.CALL_ATTEMPTED, 'test');
    expect(updated.status).toBe(NdrCaseStatus.CALL_ATTEMPTED);
    expect(updated.attemptCount).toBe(1);
    expect(ndrs.save).toHaveBeenCalled();
  });

  it('transitionNdr sets resolvedAt on terminal transitions', async () => {
    const ndr = makeNdr({ status: NdrCaseStatus.RESCHEDULED });
    ndrs.findOne.mockResolvedValue(ndr);
    const updated = await service.transitionNdr(1, NdrCaseStatus.DELIVERED);
    expect(updated.resolvedAt).toBeInstanceOf(Date);
  });

  // ----------------------------------------------------------------
  // resolveDelivered
  // ----------------------------------------------------------------

  it('resolveDelivered transitions to DELIVERED', async () => {
    const ndr = makeNdr({ status: NdrCaseStatus.CALL_ATTEMPTED, attemptCount: 1 });
    ndrs.findOne.mockResolvedValue(ndr);
    const updated = await service.resolveDelivered(1);
    expect(updated.status).toBe(NdrCaseStatus.DELIVERED);
    expect(updated.attemptCount).toBe(2);
  });

  // ----------------------------------------------------------------
  // initiateRto
  // ----------------------------------------------------------------

  it('initiateRto transitions to RTO_INITIATED, flips the shipment status to RTO, and fires the settlement cascade', async () => {
    const ndr = makeNdr({ status: NdrCaseStatus.RESCHEDULED });
    ndrs.findOne.mockResolvedValue(ndr);
    const updated = await service.initiateRto(1);
    expect(updated.status).toBe(NdrCaseStatus.RTO_INITIATED);
    expect(shipments.update).toHaveBeenCalledWith(
      { id: 101, tenantId: TENANT_ID },
      { status: 'RTO' },
    );
    expect(rtoSettlement.onShipmentRto).toHaveBeenCalledWith(101);
  });
});
