/**
 * E2E — shipment leg: createOrder → createShipment → generateShippingLabel
 *                          → ingestTracking → derived status + events.
 *
 * ENVIRONMENT NEEDS: Postgres + Redis (see support/e2e-harness.ts).
 * EXECUTED LOCALLY: NO — Docker unavailable; CI-runnable via
 *   npx nx run api-e2e:e2e --testFile=shipment-label-tracking.e2e-spec.ts
 *
 * SURFACE NOTES (verified in libs/domains/shipments):
 *  - generateShippingLabel delegates to CarrierAdapterService by carrier
 *    NAME. The SANDBOX adapter is always registered, so a carriers row
 *    named 'SANDBOX' (seeded by the harness) exercises the real path with
 *    no external carrier API.
 *  - The label row is persisted PENDING and finalized by the async
 *    'label-generator' BullMQ worker; this spec asserts the synchronous
 *    contract (row + carrierCode + labelNumber).
 *  - ingestTracking looks the shipment up by trackingNumber (tenant-scoped)
 *    and derives the shipment status from the event status.
 *  - WARNING (potential bug found while writing): ShipmentsService
 *    getShipment() uses relations: ['…','labels','trackingEvents'] but the
 *    entity relation is `label` (singular) — TypeORM 0.3 may throw
 *    FindRelationsNotFoundError. If this suite fails with that error, the
 *    fix belongs in libs/domains/shipments/shipments.service.ts.
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

const TRACKING_NUMBER = `E2ETRK${Date.now()}`;

describe('Shipment: order → shipment → label → tracking (e2e)', () => {
  let app: INestApplication;
  let stack: TenantStack;
  let shipmentId: number;
  let orderId: number;

  beforeAll(async () => {
    app = await createE2eApp();
    await truncateAll(app);
    stack = await setupTenantStack(app, 'ship');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('createOrder + createShipment open a PENDING shipment on the sandbox carrier', async () => {
    const order = await gql(app, {
      query: /* GraphQL */ `
        mutation CreateOrder($input: CreateOrderInput!) {
          createOrder(input: $input) { id orderNumber status }
        }
      `,
      variables: {
        input: {
          orderNumber: `E2E-SHIP-${Date.now()}`,
          total: 899,
          userId: stack.userId,
          destinationPincode: '560103',
          packageWeightGrams: 500,
          carrierId: stack.carrierId,
          warehouseId: stack.warehouseId,
          rankRate: false,
        },
      },
      token: stack.token,
    });
    orderId = Number(order.createOrder.id);

    const shipment = await gql(app, {
      query: /* GraphQL */ `
        mutation CreateShipment($input: CreateShipmentInput!) {
          createShipment(input: $input) {
            id
            trackingNumber
            status
            carrierId
          }
        }
      `,
      variables: {
        input: {
          trackingNumber: TRACKING_NUMBER,
          status: 'PENDING',
          orderId,
          carrierId: stack.carrierId,
          warehouseId: stack.warehouseId,
          originPincode: '560001',
          destinationPincode: '560103',
          weightGrams: 500,
        },
      },
      token: stack.token,
    });
    shipmentId = Number(shipment.createShipment.id);
    expect(shipmentId).toBeGreaterThan(0);
    expect(shipment.createShipment.trackingNumber).toBe(TRACKING_NUMBER);
    expect(shipment.createShipment.status).toBe('PENDING');
    expect(Number(shipment.createShipment.carrierId)).toBe(stack.carrierId);
  });

  it('generateShippingLabel creates a SANDBOX label request', async () => {
    const data = await gql(app, {
      query: /* GraphQL */ `
        mutation Label($input: CreateLabelInput!) {
          generateShippingLabel(input: $input) {
            id
            shipmentId
            labelNumber
            carrierCode
            status
          }
        }
      `,
      variables: { input: { shipmentId, format: 'PDF' } },
      token: stack.token,
    });
    const label = data.generateShippingLabel;
    expect(Number(label.shipmentId)).toBe(shipmentId);
    expect(label.carrierCode).toBe('SANDBOX');
    expect(label.labelNumber).toBeTruthy();
    expect(['PENDING', 'GENERATED']).toContain(label.status);
  });

  it('ingestTracking records the event and derives the shipment status', async () => {
    const occurredAt = new Date().toISOString();
    const event = await gql(app, {
      query: /* GraphQL */ `
        mutation Ingest($input: IngestTrackingInput!) {
          ingestTracking(input: $input) { id status description occurredAt }
        }
      `,
      variables: {
        input: {
          shipmentId,
          trackingNumber: TRACKING_NUMBER,
          status: 'DELIVERED',
          description: 'Delivered to recipient',
          location: 'Bengaluru',
          occurredAt,
        },
      },
      token: stack.token,
    });
    expect(event.ingestTracking.status).toBe('DELIVERED');

    const shipment = await gql(app, {
      query: /* GraphQL */ `
        query Shipment($id: Int!) {
          shipment(id: $id) {
            id
            status
            deliveredAt
            trackingEvents { id status trackingNumber }
          }
        }
      `,
      variables: { id: shipmentId },
      token: stack.token,
    });
    expect(shipment.shipment.status).toBe('DELIVERED');
    const events = shipment.shipment.trackingEvents ?? [];
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e: any) => e.status === 'DELIVERED')).toBe(true);
  });

  it('ingestTracking for an unknown tracking number is rejected', async () => {
    const body = await rawGql(app, {
      query: /* GraphQL */ `
        mutation Ingest($input: IngestTrackingInput!) {
          ingestTracking(input: $input) { id }
        }
      `,
      variables: {
        input: {
          shipmentId,
          trackingNumber: 'DOES-NOT-EXIST-999',
          status: 'IN_TRANSIT',
          occurredAt: new Date().toISOString(),
        },
      },
      token: stack.token,
    });
    // The lookup is by trackingNumber; a bogus one must not create an event.
    expect(body.errors?.length ?? 0).toBeGreaterThan(0);
  });
});
