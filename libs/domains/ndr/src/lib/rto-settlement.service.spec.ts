import { RtoSettlementService } from './rto-settlement.service';
import { NdrService } from './ndr.service';

/**
 * SS-019 — RtoSettlementService unit tests.
 *
 * The service is plain-injectable (no @Inject() with tokens), so we
 * construct it directly with mock repositories and optional side-effects.
 * Drives the cascade's branch logic:
 *  - 1/2/3/4 — wallet credit, refund, discount email, dispute record
 *  - idempotency
 *  - error resilience (wallet and refund errors don't crash the cascade)
 *  - defensive defaults (no shippingCostPaise / no ndrReason)
 */
describe('RtoSettlementService', () => {
  let service: RtoSettlementService;
  let wallet: { topUp: jest.Mock };
  let refund: { processRefund: jest.Mock };
  let notifier: { sendEmail: jest.Mock };
  let ndrs: { findOne: jest.Mock };
  let shipments: { findOne: jest.Mock };
  let disputes: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let orders: { findOne: jest.Mock };
  let tenantContext: { getTenantId: jest.Mock };

  const TENANT_ID = 7;
  const SHIPMENT_ID = 101;
  const ORDER_ID = 201;
  const TRACKING_NUMBER = 'AWB-101';

  const makeOrder = (overrides: Partial<any> = {}): any => ({
    id: ORDER_ID,
    total: 49900, // ₹499 in paise
    ...overrides,
  });

  const makeNdr = (overrides: Partial<any> = {}): any => ({
    id: 1,
    shipmentId: SHIPMENT_ID,
    ndrReason: 'CUSTOMER_REFUSED',
    customerEmail: 'cust@example.com',
    customerName: 'Cust One',
    metadata: { paymentMethod: 'PREPAID' },
    ...overrides,
  });

  // The service reads order + ndrCase via TypeORM relations on the shipment
  // (see `relations: ['order', 'ndrCase']` in the findOne call). The test
  // stubs `shipments.findOne` to return a synthetic row that already has
  // those relations attached, mirroring what TypeORM would assemble.
  const makeShipment = (overrides: Partial<any> = {}): any => ({
    id: SHIPMENT_ID,
    trackingNumber: TRACKING_NUMBER,
    tenantId: TENANT_ID,
    shippingCostPaise: 1500, // ₹15 in paise
    order: makeOrder(),
    ndrCase: makeNdr(),
    ...overrides,
  });

  beforeEach(() => {
    wallet = {
      topUp: jest
        .fn()
        .mockResolvedValue({ id: 1, tenantId: TENANT_ID, availableBalance: 1000 }),
    };
    refund = {
      processRefund: jest
        .fn()
        .mockResolvedValue({ id: 'refund-1', status: 'SUCCEEDED' }),
    };
    notifier = {
      sendEmail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
    };
    ndrs = { findOne: jest.fn() };
    shipments = { findOne: jest.fn() };
    disputes = {
      findOne: jest.fn(),
      create: jest.fn((x: any) => ({ id: 1, ...x })),
      save: jest.fn(async (x: any) => x),
    };
    orders = { findOne: jest.fn() };
    tenantContext = { getTenantId: jest.fn(() => TENANT_ID) };

    service = new RtoSettlementService(
      shipments as any,
      orders as any,
      ndrs as any,
      disputes as any,
      wallet as any,
      {} as unknown as NdrService,
      tenantContext as any,
      refund as any,
      notifier as any,
    );
  });

  // ----------------------------------------------------------------
  // 1. onShipmentRto credits the merchant wallet with the shipping cost
  // ----------------------------------------------------------------
  it('credits the merchant wallet with the shipping cost', async () => {
    shipments.findOne.mockResolvedValue(makeShipment());
    disputes.findOne.mockResolvedValue(null);

    await service.onShipmentRto(SHIPMENT_ID);

    expect(wallet.topUp).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        amount: 1500,
        idempotencyKey: expect.stringContaining(TRACKING_NUMBER),
      }),
    );
  });

  // ----------------------------------------------------------------
  // 2. onShipmentRto processes a refund for PREPAID orders
  // ----------------------------------------------------------------
  it('processes a refund for PREPAID orders', async () => {
    shipments.findOne.mockResolvedValue(
      makeShipment({
        ndrCase: makeNdr({ metadata: { paymentMethod: 'PREPAID' } }),
      }),
    );
    disputes.findOne.mockResolvedValue(null);

    await service.onShipmentRto(SHIPMENT_ID);

    expect(refund.processRefund).toHaveBeenCalledWith(
      ORDER_ID,
      49900,
      'RTO-delivery-failed',
    );
  });

  // ----------------------------------------------------------------
  // 3. onShipmentRto does NOT process a refund for COD orders
  // ----------------------------------------------------------------
  it('does NOT process a refund for COD orders', async () => {
    shipments.findOne.mockResolvedValue(
      makeShipment({
        ndrCase: makeNdr({ metadata: { paymentMethod: 'COD' } }),
      }),
    );
    disputes.findOne.mockResolvedValue(null);

    await service.onShipmentRto(SHIPMENT_ID);

    expect(refund.processRefund).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // 4. onShipmentRto sends a discount email to COD customers
  // ----------------------------------------------------------------
  it('sends a discount email to COD customers', async () => {
    shipments.findOne.mockResolvedValue(
      makeShipment({
        ndrCase: makeNdr({
          metadata: { paymentMethod: 'COD' },
          customerEmail: 'cod-cust@example.com',
        }),
      }),
    );
    disputes.findOne.mockResolvedValue(null);

    await service.onShipmentRto(SHIPMENT_ID);

    expect(notifier.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'cod-cust@example.com',
        template: 'rto_apology',
      }),
    );
    const callArgs = notifier.sendEmail.mock.calls[0][0];
    expect(callArgs.params.discountPct).toBe(15);
    expect(typeof callArgs.params.discountCode).toBe('string');
    expect(callArgs.params.discountCode.startsWith('SORRY')).toBe(true);
  });

  // ----------------------------------------------------------------
  // 5. onShipmentRto creates a dispute record with status='OPEN'
  // ----------------------------------------------------------------
  it('creates a dispute record with status=OPEN', async () => {
    shipments.findOne.mockResolvedValue(
      makeShipment({
        ndrCase: makeNdr({ ndrReason: 'CUSTOMER_REFUSED' }),
      }),
    );
    disputes.findOne.mockResolvedValue(null);

    await service.onShipmentRto(SHIPMENT_ID);

    expect(disputes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shipmentId: SHIPMENT_ID,
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        status: 'OPEN',
        reasonCode: 'CUSTOMER_REFUSED',
        openedAt: expect.any(Date),
      }),
    );
    expect(disputes.save).toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // 6. onShipmentRto is idempotent (doesn't double-credit if called twice)
  // ----------------------------------------------------------------
  it('is idempotent — second call is a no-op when dispute already exists', async () => {
    shipments.findOne.mockResolvedValue(makeShipment());
    disputes.findOne.mockResolvedValue({ id: 42, shipmentId: SHIPMENT_ID });

    await service.onShipmentRto(SHIPMENT_ID);
    await service.onShipmentRto(SHIPMENT_ID);

    // wallet.topUp called only once (the first settlement)
    expect(wallet.topUp).toHaveBeenCalledTimes(1);
    // dispute.create NOT called on second invocation
    expect(disputes.create).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // 7. Refund failure is caught and logged (doesn't crash the settlement)
  // ----------------------------------------------------------------
  it('continues settlement when wallet credit throws', async () => {
    wallet.topUp.mockRejectedValue(new Error('DB locked'));
    shipments.findOne.mockResolvedValue(makeShipment());
    disputes.findOne.mockResolvedValue(null);

    // Should NOT throw — the error is swallowed and settlement continues
    await expect(service.onShipmentRto(SHIPMENT_ID)).resolves.toBeUndefined();

    // Refund + dispute still happened
    expect(refund.processRefund).toHaveBeenCalled();
    expect(disputes.save).toHaveBeenCalled();
  });

  it('continues settlement when refund throws', async () => {
    refund.processRefund.mockRejectedValue(new Error('Payment gateway 502'));
    shipments.findOne.mockResolvedValue(makeShipment());
    disputes.findOne.mockResolvedValue(null);

    await expect(service.onShipmentRto(SHIPMENT_ID)).resolves.toBeUndefined();

    // Dispute still created
    expect(disputes.save).toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // 8. No wallet credit when shippingCostPaise is 0
  // ----------------------------------------------------------------
  it('skips wallet credit when shippingCostPaise is 0', async () => {
    shipments.findOne.mockResolvedValue(
      makeShipment({ shippingCostPaise: 0 }),
    );
    disputes.findOne.mockResolvedValue(null);

    await service.onShipmentRto(SHIPMENT_ID);

    expect(wallet.topUp).not.toHaveBeenCalled();
    expect(disputes.save).toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // 9. No wallet credit when shippingCostPaise is undefined
  // ----------------------------------------------------------------
  it('skips wallet credit when shippingCostPaise is undefined', async () => {
    shipments.findOne.mockResolvedValue(
      makeShipment({ shippingCostPaise: undefined }),
    );
    disputes.findOne.mockResolvedValue(null);

    await service.onShipmentRto(SHIPMENT_ID);

    expect(wallet.topUp).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // 10. Reason code falls back to 'unknown' when NDR case has no reason
  // ----------------------------------------------------------------
  it('falls back reasonCode to "unknown" when ndrReason is null', async () => {
    shipments.findOne.mockResolvedValue(
      makeShipment({ ndrCase: makeNdr({ ndrReason: null }) }),
    );
    disputes.findOne.mockResolvedValue(null);

    await service.onShipmentRto(SHIPMENT_ID);

    expect(disputes.create).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'unknown' }),
    );
  });
});
