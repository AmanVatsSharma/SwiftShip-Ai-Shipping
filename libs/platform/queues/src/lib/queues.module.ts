import { Module } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { WebhookDispatcher } from './webhook-dispatcher';

@Module({
  providers: [QueuesService, WebhookDispatcher],
  exports: [QueuesService, WebhookDispatcher],
})
export class QueuesModule {}
