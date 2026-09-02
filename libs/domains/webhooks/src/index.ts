// Re-export barrel for the webhooks lib.
// SS-101: points at the local TypeORM-backed implementation only — the legacy
// root `src/webhooks` re-exports are gone (see STATUS.md §3).

export {
  WebhooksModule,
  WebhooksModule as WebhooksLibModule,
} from './lib/webhooks.module';
export {
  WebhooksService,
  WebhooksService as WebhooksLibService,
} from './lib/webhooks.service';
export {
  WebhooksResolver,
  WebhooksResolver as WebhooksLibResolver,
} from './lib/webhooks.resolver';
export {
  WebhooksController,
  WebhooksController as WebhooksLibController,
} from './lib/webhooks.controller';
