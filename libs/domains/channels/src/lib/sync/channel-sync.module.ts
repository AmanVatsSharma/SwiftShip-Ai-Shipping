import { Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChannelConnectionEntity, ChannelSyncJobEntity } from './channel-sync.entities';
import { ChannelSyncService, CHANNEL_ADAPTERS } from './channel-sync.service';
import { ChannelSyncResolver } from './channel-sync.resolver';
import { ChannelSyncScheduler } from './channel-sync.scheduler';
import { ShopifyChannelAdapter } from './adapters/shopify.channel-adapter';
import { WooCommerceChannelAdapter } from './adapters/woocommerce.channel-adapter';
import type { EcomChannelAdapter } from './channel-adapter.interface';

/**
 * SS-026 — `ChannelSyncModule`
 *
 * Wires the channel-agnostic sync stack:
 *
 *   - TypeORM for Feature entities (`ChannelConnectionEntity`,
 *     `ChannelSyncJobEntity`).
 *   - `ChannelSyncService` — the orchestrator. Receives the adapter
 *     registry through the `CHANNEL_ADAPTERS` injection token.
 *   - `ChannelSyncResolver` — the GraphQL surface
 *     (`channelConnections`, `connectChannel`, etc.).
 *   - `ChannelSyncScheduler` — BullMQ processors (`channel-product-sync`,
 *     `channel-order-sync`). The host application wires the actual
 *     `QueuesService.createWorker(...)` calls — we expose the
 *     processor factories so it can.
 *   - Per-platform adapters (`ShopifyChannelAdapter`,
 *     `WooCommerceChannelAdapter`).
 *
 * The existing parent `ChannelsModule` (Amazon/Flipkart/Meesho/Myntra
 * marketplace adapters) is unchanged. The two modules are registered
 * side-by-side in `apps/api/src/app.module.ts` and do not interact.
 */
const adapterProviders: Provider[] = [
  ShopifyChannelAdapter,
  WooCommerceChannelAdapter,
  {
    provide: CHANNEL_ADAPTERS,
    useFactory: (
      shopify: ShopifyChannelAdapter,
      woocommerce: WooCommerceChannelAdapter,
    ): EcomChannelAdapter[] => [shopify, woocommerce],
    inject: [ShopifyChannelAdapter, WooCommerceChannelAdapter],
  },
];

@Module({
  imports: [TypeOrmModule.forFeature([ChannelConnectionEntity, ChannelSyncJobEntity])],
  providers: [
    ChannelSyncService,
    ChannelSyncResolver,
    ChannelSyncScheduler,
    ...adapterProviders,
  ],
  exports: [ChannelSyncService, ChannelSyncScheduler],
})
export class ChannelSyncModule {}