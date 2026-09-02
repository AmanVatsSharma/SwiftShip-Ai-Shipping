import { Injectable } from '@nestjs/common';
import { Queue, QueueOptions, Worker, JobsOptions, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

/**
 * SS-031: known queue names. Keep the list in sync with the modules
 * that publish / consume on each queue. New queues should be added
 * here so we have one place to audit BullMQ traffic in production.
 */
export const QUEUE_NAMES = {
  /** SS-031: KYC async verification (PAN + GSTIN + bank). */
  KYC_VERIFICATION: 'kyc-verification',
  /** Legacy / generic webhook dispatch queue. */
  WEBHOOK_DISPATCH: 'webhook-dispatch',
  /** Label generation. */
  LABEL_GENERATION: 'label-generation',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

@Injectable()
export class QueuesService {
  private readonly connection: IORedis;
  private readonly queues: Map<string, Queue> = new Map();

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    // BullMQ blocking connections (workers) REQUIRE maxRetriesPerRequest
    // to be null — ioredis defaults it to 20 and BullMQ throws
    // "maxRetriesPerRequest must be null" at worker construction.
    // Found by the first live boot test (2026-08); see STATUS.md.
    this.connection = new IORedis(url, {
      maxRetriesPerRequest: null,
    });
  }

  getQueue(name: string, opts?: QueueOptions): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(
        name,
        new Queue(name, { connection: this.connection, ...(opts || {}) }),
      );
    }
    return this.queues.get(name)!;
  }

  createWorker(name: string, processor: (job: any) => Promise<any>) {
    const worker = new Worker(name, processor as any, {
      connection: this.connection,
    });
    const events = new QueueEvents(name, { connection: this.connection });
    events.on('failed', ({ jobId, failedReason }) =>
      console.warn(`[Queue ${name}] job ${jobId} failed: ${failedReason}`),
    );
    events.on('completed', ({ jobId, returnvalue }) =>
      console.log(`[Queue ${name}] job ${jobId} completed`, returnvalue),
    );
    return worker;
  }

  async add(name: string, data: any, opts?: JobsOptions) {
    const queue = this.getQueue(name);
    return queue.add(name, data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 1000,
      ...(opts || {}),
    });
  }
}
