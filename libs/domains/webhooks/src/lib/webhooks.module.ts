import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  WebhookSubscriptionEntity,
  TrackingEventEntity,
} from '@swiftship/platform-typeorm';
import { QueuesModule } from '@swiftship/platform-queues';
import { WebhooksService } from './webhooks.service';
import { WebhooksResolver } from './webhooks.resolver';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    QueuesModule,
    TypeOrmModule.forFeature([WebhookSubscriptionEntity, TrackingEventEntity]),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksResolver],
  exports: [WebhooksService],
})
export class WebhooksModule {}
