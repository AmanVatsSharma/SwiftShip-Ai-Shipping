import { Injectable } from '@nestjs/common';
import { Queue, QueueOptions, Worker, JobsOptions, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class QueuesService {
  private readonly connection: IORedis;
  private readonly queues: Map<string, Queue> = new Map();

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.connection = new IORedis(url);
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
