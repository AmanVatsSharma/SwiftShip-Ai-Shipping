import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookSubscriptionEntity } from '@swiftship/platform-typeorm';
import { WebhookDispatcher } from '@swiftship/platform-queues';

/**
 * Webhooks service (TypeORM-backed, SS-101 decommission port).
 *
 * Prisma → TypeORM call-site mapping (see MIGRATION.md §7):
 *   prisma.webhookSubscription.create(...)   → repo.create + repo.save
 *   prisma.webhookSubscription.findMany(...) → repo.find({ where })
 */
@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookSubscriptionEntity)
    private readonly subscriptions: Repository<WebhookSubscriptionEntity>,
    private readonly dispatcher: WebhookDispatcher,
  ) {}

  async subscribe(
    userId: number,
    event: string,
    targetUrl: string,
    secret?: string,
  ) {
    const subscription = this.subscriptions.create({
      userId,
      event,
      targetUrl,
      secret,
    });
    return this.subscriptions.save(subscription);
  }

  async dispatch(event: string, payload: unknown) {
    const subs = await this.subscriptions.find({
      where: { event, active: true },
    });
    await Promise.all(
      subs.map((s) => this.dispatcher.enqueue(s.targetUrl, payload)),
    );
  }
}
