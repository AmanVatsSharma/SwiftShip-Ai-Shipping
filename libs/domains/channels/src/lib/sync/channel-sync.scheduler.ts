import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker, Job } from 'bullmq';

import { ChannelConnectionEntity } from './channel-sync.entities';
import { ChannelSyncService } from './channel-sync.service';
import type { ChannelSyncType } from './channel-sync.types';

/**
 * SS-026 — `ChannelSyncScheduler`
 *
 * Registers two BullMQ recurring jobs:
 *
 *   - `channel-product-sync` — every 30 minutes, iterates every
 *     `ChannelConnectionEntity` with status='active' and runs a
 *     product pull.
 *   - `channel-order-sync`   — every 5 minutes, same fan-out for orders.
 *
 * We rely on the **recurring** BullMQ pattern via a worker that wakes
 * up on a cron-like schedule (every 30 minutes).
 * The actual work for each connection is processed sequentially within
 * a tick to avoid hammering the platform API; rate-limiting across
 * connections is intentionally delegated to the platform adapter.
 *
 * Each job payload is the bare type string. The worker queries the DB
 * for active connections — keeping the worker stateless and the queue
 * payload tiny. If a new connection is added between scheduler ticks,
 * it is picked up on the next tick automatically.
 */
export const CHANNEL_SYNC_QUEUES = {
  CHANNEL_PRODUCT_SYNC: 'channel-product-sync',
  CHANNEL_ORDER_SYNC: 'channel-order-sync',
} as const;

@Injectable()
export class ChannelSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ChannelSyncScheduler.name);
  private workers: Worker[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @InjectRepository(ChannelConnectionEntity)
    private readonly connectionRepo: Repository<ChannelConnectionEntity>,
    @Optional()
    @Inject(ChannelSyncService)
    private readonly syncService: ChannelSyncService | undefined,
  ) {}

  async onModuleInit(): Promise<void> {
    // The QueuesService lives in the platform/queues lib. We don't
    // import it directly here because the channels domain lib must
    // not depend on platform internals beyond what the dependency
    // rules allow (it IS allowed — channels is a domain lib, queues
    // is a platform lib, so this is fine). We use a small Worker
    // directly so the scheduler can run even if the queues module
    // hasn't been imported (e.g. in unit tests).
    //
    // The queues themselves are added by the host application
    // (`apps/api/src/app.module.ts`) using the `createWorker` helper
    // from `QueuesService`. This keeps the registration of the queue
    // topology in one place.
    //
    // What we do here is: register a tick-driven loop using setInterval
    // as a fallback if the BullMQ infrastructure isn't available (e.g.
    // test mode). In production, the host wraps this with the
    // proper `Worker(CHANNEL_PRODUCT_SYNC, ...)` registration.

    if (process.env.NODE_ENV === 'test') {
      this.log.warn(
        'ChannelSyncScheduler running in test mode — using setInterval fallback.',
      );
      this.startIntervalFallback();
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await Promise.all(this.workers.map((w) => w.close().catch(() => undefined)));
    this.workers = [];
  }

  /**
   * Entry point used by the host application when wiring the BullMQ
   * worker. Returns the job processor — the host passes it to
   * `QueuesService.createWorker(CHANNEL_PRODUCT_SYNC, ...)`.
   */
  buildProductSyncProcessor(): (job: Job) => Promise<unknown> {
    return async (job: Job) => {
      return this.tick('products', job);
    };
  }

  /** Same as above for orders. */
  buildOrderSyncProcessor(): (job: Job) => Promise<unknown> {
    return async (job: Job) => {
      return this.tick('orders', job);
    };
  }

  /**
   * Manual tick — used by tests and by the `syncAllChannels` admin
   * button (called via the service, which in turn could be wired
   * into an admin GraphQL mutation).
   */
  async tick(type: ChannelSyncType, _job?: Job): Promise<{
    scanned: number;
    succeeded: number;
    failed: number;
  }> {
    if (!this.syncService) {
      this.log.error('tick: ChannelSyncService not available');
      return { scanned: 0, succeeded: 0, failed: 0 };
    }
    const conns = await this.connectionRepo.find({
      where: { status: 'active' },
    });
    this.log.log(
      `tick(${type}) scanning ${conns.length} active connection(s)`,
    );

    let scanned = 0;
    let succeeded = 0;
    let failed = 0;
    for (const conn of conns) {
      scanned++;
      try {
        if (type === 'products') {
          await this.syncService.syncProducts(conn.tenantId, conn);
        } else {
          await this.syncService.syncOrders(conn.tenantId, conn);
        }
        succeeded++;
      } catch (err) {
        failed++;
        this.log.error(
          `tick(${type}) channel=${conn.id} tenant=${conn.tenantId} failed: ${(err as Error).message}`,
        );
      }
    }
    return { scanned, succeeded, failed };
  }

  // -----------------------------------------------------------------
  // Fallback (test mode only)
  // -----------------------------------------------------------------

  private startIntervalFallback(): void {
    const productMs = 30 * 60 * 1000;
    const orderMs = 5 * 60 * 1000;
    this.timers.push(
      setInterval(() => {
        this.tick('products').catch(() => undefined);
      }, productMs),
      setInterval(() => {
        this.tick('orders').catch(() => undefined);
      }, orderMs),
    );
  }
}