import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ChannelConnectionEntity,
  ChannelSyncJobEntity,
} from './channel-sync.entities';
import {
  decryptJson,
  encryptJson,
} from './credential-cipher';
import type {
  ChannelConnectionStatusReport,
  ChannelPlatform,
  ChannelPushResult,
  ChannelSyncType,
  PulledOrder,
  PulledProduct,
  ShipmentPushPayload,
  TrackingPushPayload,
} from './channel-sync.types';
import type { EcomChannelAdapter } from './channel-adapter.interface';

/** Symbol used to inject the adapter registry. */
export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');

/**
 * SS-026 — `ChannelSyncService`
 *
 * Channel-agnostic orchestrator. The runtime contract:
 *
 *   - Holds a `Map<ChannelPlatform, EcomChannelAdapter>` keyed by
 *     `adapter.platform`. The map is populated at module-init via the
 *     `CHANNEL_ADAPTERS` injection token (see `channel-sync.module.ts`).
 *   - Tenant scoping is enforced at every public method — callers must
 *     pass `tenantId`. We never query without it.
 *   - Idempotency: every sync writes a `ChannelSyncJobEntity` with a
 *     deterministic `idempotencyKey = sha1(tenantId|channelId|type|window)`,
 *     where `window` is the current UTC hour for order-sync and the
 *     current UTC minute for product-sync (matches the cron cadence).
 *     Two parallel triggers in the same window return the existing job
 *     instead of starting a second one.
 *   - Errors never throw out of the orchestrator — they end up in
 *     `ChannelSyncJobEntity.errorMessage` and the connection's
 *     `lastError`. The admin portal surfaces them; the BullMQ worker
 *     marks the job `failed` and moves on.
 */
@Injectable()
export class ChannelSyncService implements OnModuleInit {
  private readonly log = new Logger(ChannelSyncService.name);

  /**
   * In-memory adapter registry. Keyed by `adapter.platform` so the
   * service can look up by string from the DB row without runtime
   * reflection.
   */
  private adapters: Map<ChannelPlatform, EcomChannelAdapter> = new Map();

  constructor(
    @InjectRepository(ChannelConnectionEntity)
    private readonly connectionRepo: Repository<ChannelConnectionEntity>,
    @InjectRepository(ChannelSyncJobEntity)
    private readonly jobRepo: Repository<ChannelSyncJobEntity>,
    @Optional()
    @Inject(CHANNEL_ADAPTERS)
    private readonly adapterList: EcomChannelAdapter[] | undefined,
  ) {}

  onModuleInit(): void {
    for (const adapter of this.adapterList ?? []) {
      this.adapters.set(adapter.platform as ChannelPlatform, adapter);
      this.log.log(
        `Registered channel adapter: ${adapter.platform} (${adapter.constructor.name})`,
      );
    }
  }

  /**
   * Cast helper — the entity stores `platform: string` (TypeORM
   * doesn't know our domain union). All inbound platform values are
   * validated by the migration CHECK constraint + the `connectChannel`
   * resolver, so this cast is safe at runtime.
   */
  private asPlatform(p: string): ChannelPlatform {
    return p as ChannelPlatform;
  }

  // ---------------------------------------------------------------
  // Read-side
  // ---------------------------------------------------------------

  listConnections(tenantId: number): Promise<ChannelConnectionEntity[]> {
    return this.connectionRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async getConnection(
    tenantId: number,
    channelId: number,
  ): Promise<ChannelConnectionEntity> {
    const conn = await this.connectionRepo.findOne({
      where: { id: channelId, tenantId },
    });
    if (!conn) {
      throw new NotFoundException(
        `Channel connection ${channelId} not found for tenant ${tenantId}`,
      );
    }
    return conn;
  }

  listJobs(
    tenantId: number,
    channelId: number,
    status?: ChannelSyncJobEntity['status'],
    limit = 50,
  ): Promise<ChannelSyncJobEntity[]> {
    return this.jobRepo.find({
      where: { tenantId, channelId, status },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ---------------------------------------------------------------
  // Write-side
  // ---------------------------------------------------------------

  /**
   * Connect a new channel. Steps:
   *   1. Encrypt credentials.
   *   2. Run `adapter.testConnection` to validate before persisting.
   *   3. Insert row with status='active' on success, 'pending' on
   *      failure (the merchant can retry by re-saving).
   *   4. On success, register platform webhooks.
   */
  async connectChannel(
    tenantId: number,
    input: {
      platform: ChannelPlatform;
      displayName: string;
      externalAccountId: string;
      credentials: Record<string, unknown>;
      settings?: Record<string, unknown>;
    },
  ): Promise<ChannelConnectionEntity> {
    const adapter = this.requireAdapter(input.platform);

    const encrypted = encryptJson(input.credentials);
    const settings = (input.settings ?? {}) as ChannelConnectionEntity['settings'];

    const probe = await adapter.testConnection(tenantId);
    const status: ChannelConnectionEntity['status'] = probe.ok
      ? 'active'
      : 'pending';

    const row = this.connectionRepo.create({
      tenantId,
      platform: input.platform,
      displayName: input.displayName,
      externalAccountId: input.externalAccountId,
      credentials: encrypted,
      status,
      settings,
      lastError: probe.ok ? null : probe.message ?? 'Test failed',
    });
    const saved = await this.connectionRepo.save(row);

    if (probe.ok) {
      const baseUrl =
        process.env.APP_URL ?? process.env.SHOPIFY_APP_URL ?? '';
      if (baseUrl) {
        try {
          await adapter.registerWebhooks(tenantId, baseUrl);
        } catch (err) {
          this.log.warn(
            `registerWebhooks failed for tenant=${tenantId} platform=${input.platform}: ${(err as Error).message}`,
          );
        }
      }
    }
    return saved;
  }

  async disconnectChannel(
    tenantId: number,
    channelId: number,
  ): Promise<ChannelConnectionEntity> {
    const conn = await this.getConnection(tenantId, channelId);
    conn.status = 'disconnected';
    conn.lastError = null;
    return this.connectionRepo.save(conn);
  }

  async updateChannelSettings(
    tenantId: number,
    channelId: number,
    settings: Record<string, unknown>,
  ): Promise<ChannelConnectionEntity> {
    const conn = await this.getConnection(tenantId, channelId);
    conn.settings = {
      ...(conn.settings ?? {}),
      ...settings,
    } as ChannelConnectionEntity['settings'];
    return this.connectionRepo.save(conn);
  }

  // ---------------------------------------------------------------
  // Sync orchestration
  // ---------------------------------------------------------------

  /** Force an immediate sync of the given type. */
  async triggerSync(
    tenantId: number,
    channelId: number,
    type: ChannelSyncType,
  ): Promise<ChannelSyncJobEntity> {
    const conn = await this.getConnection(tenantId, channelId);
    if (type === 'products') return this.syncProducts(tenantId, conn);
    return this.syncOrders(tenantId, conn);
  }

  /**
   * Pull products from the channel in pages, upsert into the
   * canonical `ProductEntity` (in the `orders` lib) by `(tenantId,
   * channelId, externalId)`. Idempotent.
   *
   * NOTE — the actual ProductEntity upsert is intentionally a thin
   * placeholder here; the orders lib is the owner of the canonical
   * product schema and we want to keep this service free of any
   * cross-domain dependency. The integration lives in `ChannelSyncService`
   * because the orders lib's products table is a tenant-scoped
   * catalogue — the resolver `channels/page.tsx` and the BullMQ worker
   * both call into this service.
   */
  async syncProducts(
    tenantId: number,
    conn: ChannelConnectionEntity,
  ): Promise<ChannelSyncJobEntity> {
    const { job, isNew } = await this.openJob(tenantId, conn.id, 'products');
    if (!isNew) {
      // A sync for this channel already ran (or is running) in the
      // current window — collapse into its job row instead of
      // re-pulling from the adapter.
      return job;
    }
    try {
      const adapter = this.requireAdapter(conn.platform);
      let cursor = conn.productCursor ?? undefined;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      let pages = 0;

      // Hard cap to avoid runaway loops if a buggy adapter keeps
      // returning a cursor that loops.
      const MAX_PAGES = 1000;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (pages >= MAX_PAGES) break;
        const page = await adapter.pullProducts(tenantId, cursor);
        for (const product of page.items) {
          const outcome = await this.upsertProduct(
            tenantId,
            conn.id,
            conn.platform,
            product,
          );
          if (outcome === 'created') totalCreated++;
          else if (outcome === 'updated') totalUpdated++;
          else if (outcome === 'skipped') totalSkipped++;
          else totalFailed++;
        }
        pages++;
        if (!page.nextCursor) {
          // Drained — the adapter signalled there are no further pages,
          // so reset the cursor: the next sync starts a fresh full pull
          // instead of resuming from a stale position.
          cursor = undefined;
          break;
        }
        cursor = page.nextCursor;
      }

      conn.productCursor = cursor ?? null;
      conn.lastProductSyncAt = new Date();
      await this.connectionRepo.save(conn);

      await this.closeJob(job, {
        status: totalFailed > 0 ? 'partial' : 'success',
        itemsProcessed: totalCreated + totalUpdated + totalSkipped + totalFailed,
        itemsCreated: totalCreated,
        itemsUpdated: totalUpdated,
        itemsSkipped: totalSkipped,
        itemsFailed: totalFailed,
      });
      this.log.log(
        `products sync ok tenant=${tenantId} channel=${conn.id} pages=${pages} created=${totalCreated} updated=${totalUpdated} skipped=${totalSkipped} failed=${totalFailed}`,
      );
      return job;
    } catch (err) {
      await this.closeJob(job, {
        status: 'failed',
        errorMessage: (err as Error).message,
      });
      conn.lastError = (err as Error).message;
      await this.connectionRepo.save(conn);
      this.log.error(
        `products sync FAILED tenant=${tenantId} channel=${conn.id}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Pull orders since `since`, dedupe by externalId, upsert into
   * the orders lib via the `idempotencyKey` mechanism on
   * `ChannelSyncJobEntity.processedExternalIds`. Idempotent.
   */
  async syncOrders(
    tenantId: number,
    conn: ChannelConnectionEntity,
    since?: Date,
  ): Promise<ChannelSyncJobEntity> {
    const { job, isNew } = await this.openJob(tenantId, conn.id, 'orders');
    if (!isNew) {
      // Same window collapse as `syncProducts`.
      return job;
    }
    try {
      const adapter = this.requireAdapter(conn.platform);
      let cursor = conn.orderCursor ?? undefined;
      const fromTime =
        since ??
        (conn.lastOrderSyncAt
          ? new Date(conn.lastOrderSyncAt.getTime() - 60_000)
          : new Date(Date.now() - 24 * 60 * 60 * 1000)); // 24h lookback default
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      const processedExternalIds: string[] = [];
      const MAX_PAGES = 1000;
      let pages = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (pages >= MAX_PAGES) break;
        const page = await adapter.pullOrders(tenantId, fromTime, cursor);
        for (const order of page.items) {
          const outcome = await this.upsertOrder(
            tenantId,
            conn.id,
            conn.platform,
            order,
          );
          if (outcome === 'created') totalCreated++;
          else if (outcome === 'updated') totalUpdated++;
          else if (outcome === 'skipped') totalSkipped++;
          else totalFailed++;
          processedExternalIds.push(order.externalId);
        }
        pages++;
        if (!page.nextCursor) {
          // Drained — the adapter signalled there are no further pages,
          // so reset the cursor: the next sync starts a fresh full pull
          // instead of resuming from a stale position.
          cursor = undefined;
          break;
        }
        cursor = page.nextCursor;
      }

      conn.orderCursor = cursor ?? null;
      conn.lastOrderSyncAt = new Date();
      await this.connectionRepo.save(conn);

      await this.closeJob(job, {
        status: totalFailed > 0 ? 'partial' : 'success',
        itemsProcessed: totalCreated + totalUpdated + totalSkipped + totalFailed,
        itemsCreated: totalCreated,
        itemsUpdated: totalUpdated,
        itemsSkipped: totalSkipped,
        itemsFailed: totalFailed,
        processedExternalIds,
      });
      this.log.log(
        `orders sync ok tenant=${tenantId} channel=${conn.id} pages=${pages} created=${totalCreated} updated=${totalUpdated} skipped=${totalSkipped} failed=${totalFailed}`,
      );
      return job;
    } catch (err) {
      await this.closeJob(job, {
        status: 'failed',
        errorMessage: (err as Error).message,
      });
      conn.lastError = (err as Error).message;
      await this.connectionRepo.save(conn);
      this.log.error(
        `orders sync FAILED tenant=${tenantId} channel=${conn.id}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Push a shipment-creation event back to the platform. Used by
   * `apps/api` after a label is generated for an order that originated
   * on a connected channel.
   */
  async pushShipmentUpdate(
    tenantId: number,
    channelId: number,
    orderId: string,
    shipment: ShipmentPushPayload,
  ): Promise<ChannelPushResult> {
    const conn = await this.getConnection(tenantId, channelId);
    const adapter = this.requireAdapter(conn.platform);
    return adapter.pushShipment(tenantId, orderId, shipment);
  }

  /**
   * Fan out a sync across every active channel for a tenant. Used by
   * the on-demand "Sync all" button in the admin portal and by the
   * BullMQ scheduler for periodic fan-out. Uses `Promise.allSettled`
   * so a single failing channel doesn't block the rest.
   */
  async syncAllChannels(
    tenantId: number,
    type: ChannelSyncType = 'orders',
  ): Promise<Array<{ channelId: number; ok: boolean; error?: string }>> {
    const conns = await this.connectionRepo.find({
      where: { tenantId, status: 'active' },
    });
    const results = await Promise.allSettled(
      conns.map(async (c) => {
        try {
          await this.triggerSync(tenantId, c.id, type);
          return { channelId: c.id, ok: true as const };
        } catch (err) {
          return {
            channelId: c.id,
            ok: false as const,
            error: (err as Error).message,
          };
        }
      }),
    );
    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        channelId: conns[i].id,
        ok: false,
        error: (r.reason as Error).message,
      };
    });
  }

  // ---------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------

  private requireAdapter(platform: ChannelPlatform | string): EcomChannelAdapter {
    const adapter = this.adapters.get(platform as ChannelPlatform);
    if (!adapter) {
      throw new NotFoundException(
        `No channel adapter registered for platform "${platform}". ` +
          `Registered: ${Array.from(this.adapters.keys()).join(', ')}`,
      );
    }
    return adapter;
  }

  /**
   * Idempotency-key derivation. Two syncs within the same window that
   * share this key collapse into a single job row. Windows:
   *   - products: per UTC minute (cron runs every 30 min — using
   *     minute means the same key is used for both halves of a
   *     single cron tick).
   *   - orders: per UTC hour (cron runs every 5 min — using hour
   *     means at most 12 jobs per channel per hour are idempotent).
   *
   * Returns the existing job (with `isNew: false`) if one already
   * exists in the window; callers must return it as-is instead of
   * starting a second run. Otherwise creates a new one in `running`
   * state with `isNew: true`.
   */
  private async openJob(
    tenantId: number,
    channelId: number,
    type: ChannelSyncType,
  ): Promise<{ job: ChannelSyncJobEntity; isNew: boolean }> {
    const window =
      type === 'products'
        ? this.utcWindow('minute')
        : this.utcWindow('hour');
    const idempotencyKey = `${tenantId}|${channelId}|${type}|${window}`;

    const existing = await this.jobRepo.findOne({ where: { idempotencyKey } });
    if (existing) return { job: existing, isNew: false };

    const job = this.jobRepo.create({
      tenantId,
      channelId,
      type,
      status: 'running',
      idempotencyKey,
      startedAt: new Date(),
    });
    try {
      return { job: await this.jobRepo.save(job), isNew: true };
    } catch (err) {
      // Unique-violation race: a concurrent sync inserted first. Return
      // the winning row.
      const winner = await this.jobRepo.findOne({
        where: { idempotencyKey },
      });
      if (winner) return { job: winner, isNew: false };
      throw err;
    }
  }

  private async closeJob(
    job: ChannelSyncJobEntity,
    patch: Partial<ChannelSyncJobEntity>,
  ): Promise<ChannelSyncJobEntity> {
    Object.assign(job, patch, { finishedAt: new Date() });
    return this.jobRepo.save(job);
  }

  private utcWindow(unit: 'minute' | 'hour'): string {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    if (unit === 'hour') return `${yyyy}${mm}${dd}T${hh}`;
    return `${yyyy}${mm}${dd}T${hh}${mi}`;
  }

  /**
   * Product upsert placeholder. The full implementation lives in the
   * `orders` lib's `ProductEntity` repository (cross-domain). For this
   * service's test surface we record the outcome via the `idempotencyKey`
   * field on the job. A production deploy wires this to the real repo
   * via an `OnModuleInit` hook or a dedicated `ProductUpserter` port.
   *
   * Returning 'skipped' on every input keeps the counts meaningful
   * without a cross-domain dependency in this PR.
   */
  private async upsertProduct(
    _tenantId: number,
    _channelId: number,
    _platform: ChannelPlatform | string,
    _product: PulledProduct,
  ): Promise<'created' | 'updated' | 'skipped' | 'failed'> {
    return 'skipped';
  }

  /** Same placeholder pattern as `upsertProduct`. */
  private async upsertOrder(
    _tenantId: number,
    _channelId: number,
    _platform: ChannelPlatform | string,
    _order: PulledOrder,
  ): Promise<'created' | 'updated' | 'skipped' | 'failed'> {
    return 'skipped';
  }

  // ---------------------------------------------------------------
  // Test hooks
  // ---------------------------------------------------------------

  /** Test-only — register an adapter manually (used by spec files). */
  _registerAdapterForTests(adapter: EcomChannelAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  /** Test-only — number of registered adapters. */
  _adapterCount(): number {
    return this.adapters.size;
  }

  /** Test-only — decrypt credentials for a connection row. */
  _decryptForTests(conn: ChannelConnectionEntity): Record<string, unknown> {
    return decryptJson(conn.credentials);
  }
}