import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { QueuesService } from './queues.service';

@Injectable()
export class WebhookDispatcher {
  static QUEUE = 'webhook-dispatch';
  constructor(private readonly queues: QueuesService) {
    this.queues.createWorker(WebhookDispatcher.QUEUE, async (job) => {
      const { targetUrl, payload } = job.data as {
        targetUrl: string;
        payload: any;
      };
      await axios.post(targetUrl, payload, { timeout: 5000 });
    });
  }

  async enqueue(targetUrl: string, payload: any) {
    await this.queues.add(WebhookDispatcher.QUEUE, { targetUrl, payload });
  }
}
