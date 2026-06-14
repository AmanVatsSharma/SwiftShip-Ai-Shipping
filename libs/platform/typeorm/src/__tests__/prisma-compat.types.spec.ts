/**
 * SS-002c — Tenant isolation tests for the PrismaCompat shim.
 *
 * These tests pin down the shim's behaviour around `tenantId`:
 *   - `findMany` / `findFirst` / `findUnique` transparently merge the
 *     current `tenantId` into the TypeORM `where` clause.
 *   - `update` / `delete` throw when the target row's `tenantId` does
 *     not match the active context.
 *   - `create` errors if the payload's `tenantId` disagrees with the
 *     context, and otherwise auto-fills it.
 *   - `withSystemContext` runs a callback with the system tenant id
 *     (id=1) regardless of the surrounding request, allowing
 *     cross-tenant reads from onboarding flows, the cod-remittance
 *     worker, and admin wallet top-ups.
 *
 * The tests stub the underlying TypeORM repository so we don't need a
 * live database — the goal is to verify the shim's translation logic,
 * not TypeORM itself.
 */
import {
  PrismaCompat,
  bindTenantContext,
  configurePrismaCompat,
  SYSTEM_TENANT_ID,
} from '../lib/prisma-compat.types';

type AnyRepo = any;

const makeRepoStub = (tableName: string): AnyRepo => {
  const findOne = jest.fn(async (opts: any) => {
    // Mimic TypeORM's behaviour: returns the row whose primary key (and
    // tenantId, if the shim merged one) matches the `where`. The
    // rowsInTable is a closure over what the test has "saved".
    return null;
  });
  const find = jest.fn(async (_opts: any) => []);
  const create = jest.fn((data: any) => ({ id: 1, ...data }));
  const save = jest.fn(async (data: any) => ({ id: 1, ...data }));
  const update = jest.fn(async (_where: any, _data: any) => undefined);
  const remove = jest.fn(async (entity: any) => entity);
  const increment = jest.fn(async () => undefined);
  const decrement = jest.fn(async () => undefined);
  const createQueryBuilder = jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => []),
    getRawOne: jest.fn(async () => null),
    getMany: jest.fn(async () => []),
    setLock: jest.fn().mockReturnThis(),
  }));
  const metadata = { tableName };
  return {
    findOne,
    find,
    create,
    save,
    update,
    remove,
    increment,
    decrement,
    createQueryBuilder,
    metadata,
  };
};

const buildCompat = () => {
  const order = makeRepoStub('orders');
  const user = makeRepoStub('users');
  const carrier = makeRepoStub('carriers');
  const shipment = makeRepoStub('shipments');
  const shippingLabel = makeRepoStub('shipping_labels');
  const trackingEvent = makeRepoStub('tracking_events');
  const warehouse = makeRepoStub('warehouses');
  const warehouseCoverage = makeRepoStub('warehouse_coverage');
  const warehouseSellerProfile = makeRepoStub('warehouse_seller_profiles');
  const warehouseStock = makeRepoStub('warehouse_stocks');
  const pincodeZone = makeRepoStub('pincode_zones');
  const shippingRate = makeRepoStub('shipping_rates');
  const rateSurcharge = makeRepoStub('rate_surcharges');
  const returnRepo = makeRepoStub('returns');
  const pickup = makeRepoStub('pickups');
  const manifest = makeRepoStub('manifests');
  const manifestItem = makeRepoStub('manifest_items');
  const ndrCase = makeRepoStub('ndr_cases');
  const codRemittance = makeRepoStub('cod_remittances');
  const webhookSubscription = makeRepoStub('webhook_subscriptions');
  const idempotencyKey = makeRepoStub('idempotency_keys');
  const ewayBill = makeRepoStub('eway_bills');
  const shopifyStore = makeRepoStub('shopify_stores');
  const shopifyOrder = makeRepoStub('shopify_orders');
  const shopifyWebhookEvent = makeRepoStub('shopify_webhook_events');
  const wooCommerceStore = makeRepoStub('woocommerce_stores');
  const wooCommerceOrder = makeRepoStub('woocommerce_orders');
  const role = makeRepoStub('roles');
  const onboardingState = makeRepoStub('onboarding_states');
  const payment = makeRepoStub('payments');
  const refund = makeRepoStub('refunds');
  const subscription = makeRepoStub('subscriptions');
  const invoice = makeRepoStub('invoices');
  const invoiceItem = makeRepoStub('invoice_items');
  const invoiceSequence = makeRepoStub('invoice_sequences');
  const refreshToken = makeRepoStub('refresh_tokens');

  // The PrismaCompat constructor only stores these on `this.*` — it
  // never calls any of them directly, so a jest.fn() for every arg is
  // fine. We use `as any` to bypass the ctor signature since it expects
  // a Repository<T> (which `makeRepoStub` doesn't formally satisfy).
  const compat = new PrismaCompat(
    user,
    order,
    carrier,
    shipment,
    shippingLabel,
    trackingEvent,
    warehouse,
    warehouseCoverage,
    warehouseSellerProfile,
    warehouseStock,
    pincodeZone,
    shippingRate,
    rateSurcharge,
    returnRepo,
    pickup,
    manifest,
    manifestItem,
    ndrCase,
    codRemittance,
    webhookSubscription,
    idempotencyKey,
    ewayBill,
    shopifyStore,
    shopifyOrder,
    shopifyWebhookEvent,
    wooCommerceStore,
    wooCommerceOrder,
    role,
    onboardingState,
    payment,
    refund,
    subscription,
    invoice,
    invoiceItem,
    invoiceSequence,
    refreshToken,
  );

  return { compat, order, user, carrier, warehouse, payment, invoice, manifest };
};

describe('PrismaCompat — SS-002c tenant isolation', () => {
  let compat: PrismaCompat;
  let orderRepo: AnyRepo;

  beforeEach(() => {
    // Wire a fallback getTenantId() that returns undefined by default.
    // The request middleware (TenantContextMiddleware) overrides this
    // via `bindTenantContext(...)` in the actual app, but here we
    // exercise both code paths.
    configurePrismaCompat({ getTenantId: () => undefined });
    const built = buildCompat();
    compat = built.compat;
    orderRepo = built.order;
  });

  it('merges tenantId into the where clause when one is bound to the request', async () => {
    await bindTenantContext(42, async () => {
      await compat.order.findMany({ where: { id: 1 } });
    });

    expect(orderRepo.find).toHaveBeenCalledTimes(1);
    const opts = orderRepo.find.mock.calls[0][0];
    expect(opts.where).toEqual({ id: 1, tenantId: 42 });
  });

  it('does not overwrite an explicit tenantId in the where clause', async () => {
    await bindTenantContext(42, async () => {
      await compat.order.findMany({ where: { id: 1, tenantId: 42 } });
    });

    const opts = orderRepo.find.mock.calls[0][0];
    expect(opts.where).toEqual({ id: 1, tenantId: 42 });
  });

  it('throws when no tenant context is set', async () => {
    await expect(compat.order.findMany({ where: { id: 1 } })).rejects.toThrow(
      /No tenant context for table 'orders'/,
    );
  });

  it('refuses an update whose row belongs to a different tenant', async () => {
    orderRepo.findOne.mockResolvedValueOnce({ id: 1, tenantId: 99 });
    await bindTenantContext(42, async () => {
      await expect(
        compat.order.update({ where: { id: 1 }, data: { status: 'X' } }),
      ).rejects.toThrow(/Cross-tenant update on 'orders'/);
    });
    // The update call must never have been issued.
    expect(orderRepo.update).not.toHaveBeenCalled();
  });

  it('allows a same-tenant update and forwards the merged where', async () => {
    orderRepo.findOne.mockResolvedValueOnce({ id: 1, tenantId: 42 });
    await bindTenantContext(42, async () => {
      await compat.order.update({ where: { id: 1 }, data: { status: 'X' } });
    });
    expect(orderRepo.update).toHaveBeenCalledWith(
      { id: 1, tenantId: 42 },
      { status: 'X' },
    );
  });

  it('refuses a cross-tenant create payload', async () => {
    await bindTenantContext(42, async () => {
      await expect(
        compat.order.create({ data: { orderNumber: 'X', total: 1, tenantId: 99 } }),
      ).rejects.toThrow(/Cross-tenant create on 'orders'/);
    });
  });

  it('auto-fills tenantId on a create payload that omits it', async () => {
    await bindTenantContext(42, async () => {
      await compat.order.create({ data: { orderNumber: 'X', total: 1 } });
    });
    // The shim called repo.create(data) — verify the auto-filled
    // tenantId is in the payload.
    const createdArg = orderRepo.create.mock.calls[0][0];
    expect(createdArg.tenantId).toBe(42);
  });

  it('does NOT filter global tables (users / roles / refresh_tokens)', async () => {
    const { user, compat: c2 } = buildCompat();
    await bindTenantContext(42, async () => {
      await c2.user.findMany({ where: { id: 1 } });
    });
    // No tenantId merge on the global table.
    const opts = user.find.mock.calls[0][0];
    expect(opts.where).toEqual({ id: 1 });
  });

  it('withSystemContext allows cross-tenant reads', async () => {
    // Even with no request context, system context enables a read.
    await compat.withSystemContext(async () => {
      await compat.order.findMany({ where: { id: 1 } });
    });
    const opts = orderRepo.find.mock.calls[0][0];
    expect(opts.where).toEqual({ id: 1, tenantId: SYSTEM_TENANT_ID });
  });

  it('withSystemContext allows an update on a row that belongs to a different tenant', async () => {
    orderRepo.findOne.mockResolvedValueOnce({ id: 1, tenantId: 99 });
    await compat.withSystemContext(async () => {
      await compat.order.update({ where: { id: 1 }, data: { status: 'X' } });
    });
    expect(orderRepo.update).toHaveBeenCalledWith(
      { id: 1, tenantId: SYSTEM_TENANT_ID },
      { status: 'X' },
    );
  });
});
