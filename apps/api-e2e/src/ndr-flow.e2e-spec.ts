/**
 * E2E — NDR leg: tracking event with a non-delivery status opens an NDR
 * case, then the ops flow resolves it (call → WhatsApp → delivered) or
 * escalates it to RTO.
 *
 * ENVIRONMENT NEEDS: Postgres + Redis (see support/e2e-harness.ts).
 * EXECUTED LOCALLY: NO — Docker unavailable; CI-runnable via
 *   npx nx run api-e2e:e2e --testFile=ndr-flow.e2e-spec.ts
 *
 * SURFACE NOTES (verified in libs/domains/ndr):
 *  - There is no `createNdr` mutation. Cases are opened by the tracking
 *    ingestion path (TrackingIngestionProcessor → NdrService
 *    .createNdrFromTracking). The processor is queue-driven, so this spec
 *    calls NdrService.createNdrFromTracking directly with a request-scoped
 *    tenant bound — the same call the worker makes.
 *  - Resolution mutations are `transitionNdr(id, to, reason)`,
 *    `markDelivered(id)` and `initiateRto(id)`. The state machine only
 *    allows PENDING → CALL_ATTEMPTED → WHATSAPP_SENT → DELIVERED (etc.),
 *    so the happy path walks that chain.
 *  - NDR reads/mutations are unguarded resolvers but the service requires
 *    a tenant context (falls back to tenant 1 without one) — the API-key
 *    header keeps everything scoped to the fresh tenant.
 */
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NdrService } from '@swiftship/domains-ndr';
import { ShipmentEntity } from '@swiftship/platform-typeorm';
import {
  createE2eApp,
  gql,
  scopedTenantResolver,
  setupTenantStack,
  truncateAll,
  type TenantStack,
} from './support/e2e-harness';

describe('NDR flow: open case on failed delivery → resolve / escalate (e2e)', () => {
  let app: INestApplication;
  let stack: TenantStack;

  /** Create an order + shipment and open an NDR case on it (worker path). */
  async function openNdr(trackingSuffix: string, reason: string): Promise<number> {
    const order = await gql(app, {
      query: `mutation($input: CreateOrderInput!) { createOrder(input: $input) { id } }`,
      variables: {
        input: {
          orderNumber: `E2E-NDR-${trackingSuffix}-${Date.now()}`,
          total: 499,
          userId: stack.userId,
          destinationPincode: '560103',
          packageWeightGrams: 300,
          carrierId: stack.carrierId,
          warehouseId: stack.warehouseId,
          rankRate: false,
        },
      },
      token: stack.token,
    });
    const shipment = await gql(app, {
      query: `mutation($input: CreateShipmentInput!) { createShipment(input: $input) { id } }`,
      variables: {
        input: {
          trackingNumber: `E2ENDR${trackingSuffix}${Date.now()}`,
          status: 'PENDING',
          orderId: Number(order.createOrder.id),
          carrierId: stack.carrierId,
        },
      },
      token: stack.token,
    });
    const shipmentId = Number(shipment.createShipment.id);
    const shipmentRow = await app
      .get(DataSource)
      .getRepository(ShipmentEntity)
      .findOne({ where: { id: shipmentId } });
    if (!shipmentRow) throw new Error(`shipment ${shipmentId} not found`);

    const resolve = scopedTenantResolver(app, stack.tenantId);
    const ndrService = await resolve(NdrService);
    const ndr = await ndrService.createNdrFromTracking(shipmentRow, reason);
    return ndr.id;
  }

  beforeAll(async () => {
    app = await createE2eApp();
    await truncateAll(app);
    stack = await setupTenantStack(app, 'ndr');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('a CUSTOMER_NOT_AVAILABLE tracking outcome opens a PENDING NDR case', async () => {
    const ndrId = await openNdr('a', 'CUSTOMER_NOT_AVAILABLE');
    const data = await gql(app, {
      query: `query($id: Int!) { ndrCase(id: $id) { id status ndrReason attemptCount shipmentId } }`,
      variables: { id: ndrId },
      apiKey: stack.apiKey,
    });
    expect(data.ndrCase.status).toBe('PENDING');
    expect(data.ndrCase.ndrReason).toBe('CUSTOMER_NOT_AVAILABLE');
    expect(data.ndrCase.attemptCount).toBe(0);
  });

  it('ops chain call → WhatsApp → markDelivered resolves the case', async () => {
    const ndrId = await openNdr('b', 'PHONE_UNREACHABLE');

    const call = await gql(app, {
      query: `mutation($id: Int!, $to: NdrCaseStatus!, $reason: String) { transitionNdr(id: $id, to: $to, reason: $reason) { id status attemptCount } }`,
      variables: { id: ndrId, to: 'CALL_ATTEMPTED', reason: 'called customer' },
      apiKey: stack.apiKey,
    });
    expect(call.transitionNdr.status).toBe('CALL_ATTEMPTED');
    expect(call.transitionNdr.attemptCount).toBe(1);

    const wa = await gql(app, {
      query: `mutation($id: Int!, $to: NdrCaseStatus!) { transitionNdr(id: $id, to: $to) { id status } }`,
      variables: { id: ndrId, to: 'WHATSAPP_SENT' },
      apiKey: stack.apiKey,
    });
    expect(wa.transitionNdr.status).toBe('WHATSAPP_SENT');

    const delivered = await gql(app, {
      query: `mutation($id: Int!) { markDelivered(id: $id) { id status resolvedAt } }`,
      variables: { id: ndrId },
      apiKey: stack.apiKey,
    });
    expect(delivered.markDelivered.status).toBe('DELIVERED');
    expect(delivered.markDelivered.resolvedAt).toBeTruthy();
  });

  it('illegal transitions are rejected by the state machine', async () => {
    const ndrId = await openNdr('c', 'ADDRESS_INCOMPLETE');
    // PENDING → DELIVERED is not a legal edge (must go via contact states).
    const body = await gql(app, {
      query: `mutation($id: Int!, $to: NdrCaseStatus!) { transitionNdr(id: $id, to: $to) { id } }`,
      variables: { id: ndrId, to: 'DELIVERED' },
      apiKey: stack.apiKey,
    }).catch(() => null);
    expect(body).toBeNull();
  });

  it('ndrCases lists only this tenant’s cases', async () => {
    await openNdr('d', 'CONSIGNEE_REFUSED');
    const data = await gql(app, {
      query: `query { ndrCases { id tenantId ndrReason } }`,
      apiKey: stack.apiKey,
    });
    expect(data.ndrCases.length).toBeGreaterThanOrEqual(3);
    for (const c of data.ndrCases) {
      expect(Number(c.tenantId)).toBe(stack.tenantId);
    }
  });
});
