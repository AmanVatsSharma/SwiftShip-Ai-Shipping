/**
 * E2E — order lifecycle leg: createOrder → order(id) → cancel → isolation.
 *
 * ENVIRONMENT NEEDS: Postgres + Redis (see support/e2e-harness.ts).
 * EXECUTED LOCALLY: NO — Docker unavailable; CI-runnable via
 *   npx nx run api-e2e:e2e --testFile=order-lifecycle.e2e-spec.ts
 *
 * SURFACE NOTES (verified in libs/domains/orders):
 *  - There is no `cancelOrder` mutation. Cancellation is
 *    `updateOrder(input: { id, status: CANCELLED })` — asserted here.
 *  - createOrder/order/updateOrder are guarded by GqlAuthGuard + RolesGuard
 *    (ADMIN/STAFF[/SELLER]) AND need a tenant context; the harness JWT
 *    carries both `roles: ['ADMIN']` and a `tenantId` claim.
 *  - `rankRate: false` + a seeded SANDBOX carrier keeps the rate engine out
 *    of this spec (it has its own suite below).
 */
import { INestApplication } from '@nestjs/common';
import {
  createE2eApp,
  gql,
  rawGql,
  setupTenantStack,
  truncateAll,
  type TenantStack,
} from './support/e2e-harness';

const CREATE_ORDER = /* GraphQL */ `
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      orderNumber
      status
      paymentStatus
      destinationPincode
      carrierId
    }
  }
`;

const ORDER_QUERY = /* GraphQL */ `
  query Order($id: Int!) {
    order(id: $id) { id orderNumber status carrierId }
  }
`;

async function createOrderFor(
  app: INestApplication,
  stack: TenantStack,
  orderNumber: string,
) {
  return gql(app, {
    query: CREATE_ORDER,
    variables: {
      input: {
        orderNumber,
        total: 1299,
        userId: stack.userId,
        destinationName: 'E2E Customer',
        destinationPhone: '9876543210',
        destinationAddressLine1: '2 Query Lane',
        destinationCity: 'Bengaluru',
        destinationState: 'Karnataka',
        destinationPincode: '560103',
        destinationCountry: 'India',
        packageWeightGrams: 750,
        carrierId: stack.carrierId,
        warehouseId: stack.warehouseId,
        rankRate: false,
        paymentMethod: 'PREPAID',
      },
    },
    token: stack.token,
  });
}

describe('Order lifecycle: create → read → cancel → tenant isolation (e2e)', () => {
  let app: INestApplication;
  let tenantA: TenantStack;
  let tenantB: TenantStack;
  let orderId: number;

  beforeAll(async () => {
    app = await createE2eApp();
    await truncateAll(app);
    tenantA = await setupTenantStack(app, 'ordA');
    tenantB = await setupTenantStack(app, 'ordB');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('createOrder persists a PENDING, PREPAID order for tenant A', async () => {
    const data = await createOrderFor(app, tenantA, `E2E-A-${Date.now()}`);
    orderId = Number(data.createOrder.id);
    expect(orderId).toBeGreaterThan(0);
    expect(data.createOrder.orderNumber).toContain('E2E-A-');
    expect(data.createOrder.status).toBe('PENDING');
    expect(data.createOrder.paymentStatus).toBe('PENDING');
    expect(Number(data.createOrder.carrierId)).toBe(tenantA.carrierId);
  });

  it('order(id) returns the order for its own tenant', async () => {
    const data = await gql(app, {
      query: ORDER_QUERY,
      variables: { id: orderId },
      token: tenantA.token,
    });
    expect(data.order.id).toBe(orderId);
    expect(data.order.orderNumber).toContain('E2E-A-');
  });

  it('updateOrder(status: CANCELLED) cancels the order (no cancelOrder mutation exists)', async () => {
    const data = await gql(app, {
      query: /* GraphQL */ `
        mutation Update($input: UpdateOrderInput!) {
          updateOrder(input: $input) { id status }
        }
      `,
      variables: { input: { id: orderId, status: 'CANCELLED' } },
      token: tenantA.token,
    });
    expect(data.updateOrder.status).toBe('CANCELLED');

    const reread = await gql(app, {
      query: ORDER_QUERY,
      variables: { id: orderId },
      token: tenantA.token,
    });
    expect(reread.order.status).toBe('CANCELLED');
  });

  it('tenant B cannot read tenant A’s order (tenant isolation)', async () => {
    const body = await rawGql(app, {
      query: ORDER_QUERY,
      variables: { id: orderId },
      token: tenantB.token,
    });
    // OrdersService.getOrder filters by tenantId → NotFound for tenant B.
    // The `order` field is non-nullable, so the payload must carry an error
    // and no order row may leak back.
    expect(body.errors?.length ?? 0).toBeGreaterThan(0);
    expect(body.data?.order ?? null).toBeNull();
  });

  it('tenant B sees only its own orders in the orders list', async () => {
    await createOrderFor(app, tenantB, `E2E-B-${Date.now()}`);
    const data = await gql(app, {
      query: `query { orders { id orderNumber } }`,
      token: tenantB.token,
    });
    expect(data.orders.length).toBe(1);
    expect(data.orders[0].orderNumber).toContain('E2E-B-');
  });
});
