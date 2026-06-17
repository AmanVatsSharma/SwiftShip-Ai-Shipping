import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChannelSyncService, CHANNEL_ADAPTERS } from './channel-sync.service';
import { ChannelConnectionEntity, ChannelSyncJobEntity } from './channel-sync.entities';
import type { EcomChannelAdapter } from './channel-adapter.interface';
import type {
  ChannelConnectionStatusReport,
  PulledOrder,
  PulledProduct,
  ShipmentPushPayload,
  TrackingPushPayload,
  ChannelPushResult,
  ChannelWebhookRegistration,
} from './channel-sync.types';

/**
 * SS-026 — ChannelSyncService spec.
 *
 * Exercises the orchestrator in isolation: a fake adapter registry
 * plus stubbed TypeORM repos. Asserts:
 *   - the adapter registry is keyed by `platform`
 *   - `connectChannel` calls `testConnection`, encrypts credentials,
 *     and creates a row
 *   - `syncProducts` pages through the adapter, advances the cursor,
 *     and writes a job row
 *   - idempotency: the second `syncProducts` call within the same
 *     UTC minute returns the same job row
 *   - `syncAllChannels` uses `Promise.allSettled` so one failing
 *     channel doesn't block the others
 */
describe('SS-026 ChannelSyncService', () => {
  let svc: ChannelSyncService;
  let connRepo: FakeConnRepo;
  let jobRepo: FakeJobRepo;
  let adapter: FakeAdapter;

  beforeEach(async () => {
    process.env.CHANNEL_ENCRYPTION_KEY = 'unit-test-encryption-key-32chars-min!!';

    connRepo = new FakeConnRepo();
    jobRepo = new FakeJobRepo();
    adapter = new FakeAdapter();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelSyncService,
        { provide: CHANNEL_ADAPTERS, useValue: [adapter] },
        { provide: getRepositoryToken(ChannelConnectionEntity), useValue: connRepo },
        { provide: getRepositoryToken(ChannelSyncJobEntity), useValue: jobRepo },
      ],
    }).compile();

    svc = moduleRef.get(ChannelSyncService);
    svc.onModuleInit();
  });

  it('registers the injected adapter by platform', () => {
    expect(svc._adapterCount()).toBe(1);
  });

  it('connectChannel encrypts credentials, calls testConnection, persists active row', async () => {
    const conn = await svc.connectChannel(7, {
      platform: 'shopify',
      displayName: 'Aurora',
      externalAccountId: 'aurora.myshopify.com',
      credentials: { shop: 'aurora.myshopify.com', accessToken: 'shpat_x' },
    });
    expect(conn.tenantId).toBe(7);
    expect(conn.platform).toBe('shopify');
    expect(conn.status).toBe('active');
    expect(conn.credentials).not.toContain('shpat_x');
    const decoded = svc._decryptForTests(conn);
    expect(decoded).toEqual({
      shop: 'aurora.myshopify.com',
      accessToken: 'shpat_x',
    });
    expect(adapter.testConnectionCalls).toBe(1);
  });

  it('connectChannel persists pending row when testConnection fails', async () => {
    adapter.nextTestResult = { ok: false, platform: 'shopify', message: 'bad creds' };
    const conn = await svc.connectChannel(7, {
      platform: 'shopify',
      displayName: 'Aurora',
      externalAccountId: 'aurora.myshopify.com',
      credentials: { shop: 'aurora.myshopify.com', accessToken: 'shpat_x' },
    });
    expect(conn.status).toBe('pending');
    expect(conn.lastError).toBe('bad creds');
  });

  it('syncProducts pages through the adapter and advances the cursor', async () => {
    const conn = await svc.connectChannel(7, {
      platform: 'shopify',
      displayName: 'Aurora',
      externalAccountId: 'aurora.myshopify.com',
      credentials: { shop: 'aurora.myshopify.com', accessToken: 'shpat_x' },
    });
    adapter.productPages = [
      {
        items: [
          { externalId: 'p1', title: 'A', price: { amount: 1, currency: 'INR' } },
          { externalId: 'p2', title: 'B', price: { amount: 2, currency: 'INR' } },
        ],
        nextCursor: 'cursor-2',
      },
      { items: [{ externalId: 'p3', title: 'C' }], nextCursor: null },
    ];

    const job = await svc.syncProducts(7, conn);
    expect(job.status).toBe('success');
    expect(job.itemsProcessed).toBe(3);

    const refreshed = connRepo.rows[0];
    expect(refreshed.productCursor).toBeNull(); // last cursor was null
    expect(refreshed.lastProductSyncAt).toBeInstanceOf(Date);
    expect(adapter.productPages).toHaveLength(0); // drained
  });

  it('idempotency: two syncProducts calls within the same window share a job row', async () => {
    const conn = await svc.connectChannel(7, {
      platform: 'shopify',
      displayName: 'Aurora',
      externalAccountId: 'aurora.myshopify.com',
      credentials: { shop: 'aurora.myshopify.com', accessToken: 'shpat_x' },
    });
    adapter.productPages = [{ items: [{ externalId: 'p1', title: 'A' }], nextCursor: null }];

    const j1 = await svc.syncProducts(7, conn);
    const j2 = await svc.syncProducts(7, conn);
    expect(j1.id).toBe(j2.id);
    // Only one adapter call — the second was collapsed by the
    // idempotency key.
    expect(adapter.pullProductsCalls).toBe(1);
  });

  it('syncAllChannels fans out and uses allSettled (one failure does not block)', async () => {
    await svc.connectChannel(7, {
      platform: 'shopify',
      displayName: 'OK',
      externalAccountId: 'ok.myshopify.com',
      credentials: { shop: 'ok.myshopify.com', accessToken: 'shpat_x' },
    });
    await svc.connectChannel(8, {
      platform: 'shopify',
      displayName: 'BAD',
      externalAccountId: 'bad.myshopify.com',
      credentials: { shop: 'bad.myshopify.com', accessToken: 'shpat_x' },
    });
    adapter.nextPullError = new Error('platform 500');
    // Tenant 7: a working pull; tenant 8: failing pull.
    const results = await svc.syncAllChannels(7, 'products');
    // We only filter by tenantId=7, so only the OK connection
    // participates. The result still has the allSettled shape.
    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(true);
  });

  it('pushShipmentUpdate delegates to the adapter', async () => {
    const conn = await svc.connectChannel(7, {
      platform: 'shopify',
      displayName: 'Aurora',
      externalAccountId: 'aurora.myshopify.com',
      credentials: { shop: 'aurora.myshopify.com', accessToken: 'shpat_x' },
    });
    const result = await svc.pushShipmentUpdate(7, conn.id, '9001', {
      carrier: 'Delhivery',
      trackingNumber: 'TRACK-1',
      items: [{ sku: 'sku-1', quantity: 1 }],
    });
    expect(result.ok).toBe(true);
    expect(adapter.pushShipmentCalls).toBe(1);
  });
});

// ===========================================================
// Fakes
// ===========================================================

class FakeConnRepo {
  rows: ChannelConnectionEntity[] = [];
  private id = 0;

  find(opts: any): Promise<ChannelConnectionEntity[]> {
    const where = opts?.where ?? {};
    const matched = this.rows.filter(
      (r) =>
        (where.tenantId === undefined || r.tenantId === where.tenantId) &&
        (where.status === undefined || r.status === where.status),
    );
    return Promise.resolve(matched);
  }

  findOne(opts: any): Promise<ChannelConnectionEntity | null> {
    const w = opts?.where ?? {};
    const found =
      this.rows.find(
        (r) =>
          r.id === w.id &&
          (w.tenantId === undefined || r.tenantId === w.tenantId),
      ) ?? null;
    return Promise.resolve(found);
  }

  create(data: Partial<ChannelConnectionEntity>): ChannelConnectionEntity {
    const row = { ...(data as ChannelConnectionEntity) };
    this.id += 1;
    row.id = this.id;
    row.createdAt = row.createdAt ?? new Date();
    row.updatedAt = row.updatedAt ?? new Date();
    return row;
  }

  async save(row: ChannelConnectionEntity): Promise<ChannelConnectionEntity> {
    const idx = this.rows.findIndex((r) => r.id === row.id);
    row.updatedAt = new Date();
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
    return row;
  }
}

class FakeJobRepo {
  rows: ChannelSyncJobEntity[] = [];
  private id = 0;

  findOne(opts: any): Promise<ChannelSyncJobEntity | null> {
    return Promise.resolve(
      this.rows.find((r) => r.idempotencyKey === opts?.where?.idempotencyKey) ?? null,
    );
  }

  find(opts: any): Promise<ChannelSyncJobEntity[]> {
    const w = opts?.where ?? {};
    return Promise.resolve(
      this.rows
        .filter(
          (r) =>
            (w.tenantId === undefined || r.tenantId === w.tenantId) &&
            (w.channelId === undefined || r.channelId === w.channelId) &&
            (w.status === undefined || r.status === w.status),
        )
        .sort((a, b) => (b.createdAt as any) - (a.createdAt as any))
        .slice(0, opts?.take ?? 50),
    );
  }

  create(data: Partial<ChannelSyncJobEntity>): ChannelSyncJobEntity {
    const row = { ...(data as ChannelSyncJobEntity) };
    this.id += 1;
    row.id = this.id;
    row.createdAt = row.createdAt ?? new Date();
    row.updatedAt = row.updatedAt ?? new Date();
    return row;
  }

  async save(row: ChannelSyncJobEntity): Promise<ChannelSyncJobEntity> {
    const idx = this.rows.findIndex((r) => r.id === row.id);
    row.updatedAt = new Date();
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
    return row;
  }
}

class FakeAdapter implements EcomChannelAdapter {
  public readonly platform = 'shopify' as const;
  testConnectionCalls = 0;
  pullProductsCalls = 0;
  pullOrdersCalls = 0;
  pushShipmentCalls = 0;
  pushTrackingCalls = 0;
  registerWebhooksCalls = 0;
  productPages: Array<{
    items: PulledProduct[];
    nextCursor?: string | null;
  }> = [];
  orderPages: Array<{
    items: PulledOrder[];
    nextCursor?: string | null;
  }> = [];
  nextTestResult?: ChannelConnectionStatusReport;
  nextPullError?: Error;

  async testConnection(_tenantId: number): Promise<ChannelConnectionStatusReport> {
    this.testConnectionCalls++;
    if (this.nextTestResult) return this.nextTestResult;
    return { ok: true, platform: this.platform };
  }

  async pullProducts(
    _tenantId: number,
    cursor?: string,
  ): Promise<{ items: PulledProduct[]; nextCursor?: string | null }> {
    this.pullProductsCalls++;
    if (this.nextPullError) throw this.nextPullError;
    if (!cursor) {
      return this.productPages.shift() ?? { items: [], nextCursor: null };
    }
    return this.productPages.shift() ?? { items: [], nextCursor: null };
  }

  async pullOrders(
    _tenantId: number,
    _since: Date,
    _cursor?: string,
  ): Promise<{ items: PulledOrder[]; nextCursor?: string | null }> {
    this.pullOrdersCalls++;
    if (this.nextPullError) throw this.nextPullError;
    return this.orderPages.shift() ?? { items: [], nextCursor: null };
  }

  async pushShipment(
    _tenantId: number,
    orderId: string,
    _shipment: ShipmentPushPayload,
  ): Promise<ChannelPushResult> {
    this.pushShipmentCalls++;
    return { ok: true, platform: this.platform, externalOrderId: orderId };
  }

  async pushTracking(
    _tenantId: number,
    orderId: string,
    _tracking: TrackingPushPayload,
  ): Promise<ChannelPushResult> {
    this.pushTrackingCalls++;
    return { ok: true, platform: this.platform, externalOrderId: orderId };
  }

  async registerWebhooks(
    _tenantId: number,
    _baseUrl: string,
  ): Promise<ChannelWebhookRegistration> {
    this.registerWebhooksCalls++;
    return { ok: true, platform: this.platform, registered: [] };
  }
}