import { NdrCaseStatus, ShipmentStatus } from '@swiftship/platform-typeorm';
import { NdrStateMachine } from './ndr-state-machine.service';
import { TrackingIngestionProcessor } from './tracking-ingestion.processor';

const SS = ShipmentStatus;

/**
 * SS-017 — TrackingIngestionProcessor unit tests.
 *
 * Tests the `process` method directly (bypassing BullMQ). Mocks the
 * repository layer so we can verify:
 *  - tracking events are persisted
 *  - NOT_DELIVERED creates a PENDING NDR case
 *  - DELIVERED resolves (or no-ops) an existing NDR case
 *  - carrier-agnostic status normalisation (case-insensitive)
 */
describe('TrackingIngestionProcessor', () => {
  let processor: TrackingIngestionProcessor;
  let tracking: {
    save: jest.Mock;
    create: jest.Mock;
  };
  let ndrs: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let shipments: {
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let ndrService: {
    createNdrFromTracking: jest.Mock;
  };
  let sm: jest.Mocked<NdrStateMachine>;

  const TENANT_ID = 7;
  const makeShipment = (overrides: Partial<any> = {}): any => ({
    id: 201,
    trackingNumber: 'AWB-201',
    carrierName: 'Shadowfax',
    customerPhone: '+91-90000-00002',
    customerEmail: 'cust2@example.com',
    customerName: 'Cust Two',
    status: SS.IN_TRANSIT,
    tenantId: TENANT_ID,
    ...overrides,
  });

  beforeEach(() => {
    tracking = {
      save: jest.fn(async (x) => x),
      create: jest.fn((x) => ({ id: 1, ...x })),
    };
    ndrs = {
      findOne: jest.fn(),
      save: jest.fn(async (x) => x),
    };
    shipments = {
      findOne: jest.fn(),
      update: jest.fn(async () => ({})),
    };
    ndrService = {
      createNdrFromTracking: jest.fn(async (s, r) => ({
        id: 1,
        shipmentId: s.id,
        status: NdrCaseStatus.PENDING,
        ndrReason: r,
        shipment: s,
      })),
    };
    sm = {
      isTerminal: jest.fn().mockReturnValue(false),
      transition: jest.fn(),
    } as any;

    processor = new TrackingIngestionProcessor(
      { createWorker: jest.fn() } as any, // QueuesService not needed
      shipments as any,
      tracking as any,
      ndrs as any,
      ndrService as any,
      sm as unknown as NdrStateMachine,
    );
  });

  // ----------------------------------------------------------------
  // Bad payload
  // ----------------------------------------------------------------

  it('returns ignore for an empty payload', async () => {
    const r = await processor.process({ shipmentId: 0 } as any);
    expect(r.action).toBe('ignore');
  });

  // ----------------------------------------------------------------
  // NOT_DELIVERED → create_ndr
  // ----------------------------------------------------------------

  it('creates a PENDING NDR case for NOT_DELIVERED tracking', async () => {
    shipments.findOne.mockResolvedValue(makeShipment());
    const r = await processor.process({
      shipmentId: 201,
      trackingStatus: 'NOT_DELIVERED',
      carrierCode: 'DELHIVERY',
    });
    expect(r.action).toBe('create_ndr');
    expect(r.ndrId).toBe(1);
    expect(ndrService.createNdrFromTracking).toHaveBeenCalledWith(
      expect.objectContaining({ id: 201 }),
      'NOT_DELIVERED',
    );
  });

  it('persists the raw tracking event', async () => {
    shipments.findOne.mockResolvedValue(makeShipment());
    await processor.process({
      shipmentId: 201,
      trackingStatus: 'NOT_DELIVERED',
      carrierCode: 'DELHIVERY',
      description: 'Gate closed',
    });
    expect(tracking.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'NOT_DELIVERED', description: 'Gate closed' }),
    );
  });

  // ----------------------------------------------------------------
  // Carrier status normalisation (case-insensitive)
  // ----------------------------------------------------------------

  it.each([
    'customer not available',
    'Customer Not Available',
    'CUSTOMER_NOT_AVAILABLE',
    'customer-not-available',
    'CUSTOMER-NOT-AVAILABLE',
  ])(
    'normalises "%s" to create_ndr',
    async (rawStatus: string) => {
      shipments.findOne.mockResolvedValue(makeShipment());
      const r = await processor.process({
        shipmentId: 201,
        trackingStatus: rawStatus,
        carrierCode: 'BLUEDART',
      });
      expect(r.action).toBe('create_ndr');
      expect(ndrService.createNdrFromTracking).toHaveBeenCalled();
    },
  );

  // ----------------------------------------------------------------
  // DELIVERED → resolve (existing NDR)
  // ----------------------------------------------------------------

  it('resolves an existing NDR case when tracking shows DELIVERED', async () => {
    shipments.findOne.mockResolvedValue(makeShipment({ status: SS.OUT_FOR_DELIVERY }));
    const ndr = {
      id: 5,
      status: NdrCaseStatus.WHATSAPP_SENT,
      shipmentId: 201,
      tenantId: TENANT_ID,
    };
    ndrs.findOne.mockResolvedValue(ndr);

    const r = await processor.process({
      shipmentId: 201,
      trackingStatus: 'DELIVERED',
      carrierCode: 'DELHIVERY',
    });

    expect(r.action).toBe('resolve');
    expect(r.ndrId).toBe(5);
    // State machine should have been called to transition to DELIVERED
    expect(sm.transition).toHaveBeenCalledWith(
      ndr,
      NdrCaseStatus.DELIVERED,
      'tracking event DELIVERED',
    );
  });

  it('no-ops resolution when the shipment has no NDR', async () => {
    shipments.findOne.mockResolvedValue(makeShipment({ status: SS.DELIVERED }));
    ndrs.findOne.mockResolvedValue(null);

    const r = await processor.process({
      shipmentId: 201,
      trackingStatus: 'DELIVERED',
      carrierCode: 'SHADOWFAX',
    });

    expect(r.action).toBe('resolve');
    expect(r.ndrId).toBeUndefined();
    expect(sm.transition).not.toHaveBeenCalled();
  });

  it('no-ops resolution when the NDR is already terminal', async () => {
    shipments.findOne.mockResolvedValue(makeShipment({ status: SS.DELIVERED }));
    ndrs.findOne.mockResolvedValue({
      id: 5,
      status: NdrCaseStatus.DELIVERED,
      shipmentId: 201,
      tenantId: TENANT_ID,
    });
    sm.isTerminal.mockReturnValue(true);

    const r = await processor.process({
      shipmentId: 201,
      trackingStatus: 'DELIVERED',
      carrierCode: 'SHADOWFAX',
    });

    expect(r.action).toBe('resolve');
    expect(r.ndrId).toBe(5);
    expect(sm.transition).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // Unknown tracking status → default create_ndr
  // ----------------------------------------------------------------

  it('falls back to create_ndr for unknown carrier statuses', async () => {
    shipments.findOne.mockResolvedValue(makeShipment());
    const r = await processor.process({
      shipmentId: 201,
      trackingStatus: 'CARRIER_SPECIAL_EVENT_X',
      carrierCode: 'XYZ',
    });
    expect(r.action).toBe('create_ndr');
    expect(ndrService.createNdrFromTracking).toHaveBeenCalledWith(
      expect.any(Object),
      'UNKNOWN:CARRIER_SPECIAL_EVENT_X',
    );
  });

  // ----------------------------------------------------------------
  // RTO
  // ----------------------------------------------------------------

  it('escalates to RTO_INITIATED for RTO tracking events', async () => {
    shipments.findOne.mockResolvedValue(makeShipment());
    const ndr = {
      id: 5,
      status: NdrCaseStatus.RESCHEDULED,
      shipmentId: 201,
      tenantId: TENANT_ID,
    };
    ndrs.findOne.mockResolvedValue(ndr);

    const r = await processor.process({
      shipmentId: 201,
      trackingStatus: 'RTO_INITIATED',
      carrierCode: 'DELHIVERY',
    });

    expect(r.action).toBe('rto');
    expect(sm.transition).toHaveBeenCalledWith(
      ndr,
      NdrCaseStatus.RTO_INITIATED,
      'RTO_INITIATED',
    );
  });
});
