import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookDispatcher } from '../queues/workers/webhook-dispatcher';

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService, private readonly dispatcher: WebhookDispatcher) {}

  async subscribe(userId: number, event: string, targetUrl: string, secret?: string) {
    return this.prisma.webhookSubscription.create({ data: { userId, event, targetUrl, secret } });
  }

  async dispatch(event: string, payload: any) {
    const subs = await this.prisma.webhookSubscription.findMany({ where: { event, active: true } });
    await Promise.all(subs.map((s) => this.dispatcher.enqueue(s.targetUrl, payload)));
  }
}
