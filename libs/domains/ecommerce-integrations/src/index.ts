// Re-export barrel for the e-commerce integrations lib.
// This lib wraps Shopify, WooCommerce, and other e-com platform connectors
// under a single module boundary. Sub-platforms (shopify/, woocommerce/)
// have their own sub-modules with controllers, services, and resolvers.
//
// SS-101: the barrel now points at the local TypeORM-backed implementation
// only — the legacy root `src/ecommerce-integrations` re-exports are gone.

export {
  EcommerceIntegrationsModule,
  EcommerceIntegrationsModule as EcommerceIntegrationsLibModule,
} from './lib/ecommerce-integrations.module';
export { ecommerceIntegrationsConfig } from './lib/ecommerce-integrations.config';

// Shopify sub-platform
export { ShopifyModule } from './lib/platforms/shopify/shopify.module';
export { ShopifyIntegrationService } from './lib/platforms/shopify/services/shopify-integration.service';
export { ShopifyOrdersService } from './lib/platforms/shopify/services/shopify-orders.service';
export { ShopifyIntegrationResolver } from './lib/platforms/shopify/resolvers/shopify-integration.resolver';
export { ShopifyOrdersResolver } from './lib/platforms/shopify/resolvers/shopify-orders.resolver';
export { ShopifyController } from './lib/platforms/shopify/shopify.controller';
export { ShopifyWebhookController } from './lib/platforms/shopify/shopify.webhook.controller';

// WooCommerce sub-platform
export { WooCommerceModule } from './lib/platforms/woocommerce/woocommerce.module';
export { WooCommerceIntegrationService } from './lib/platforms/woocommerce/services/woocommerce-integration.service';
export { WooCommerceOrdersService } from './lib/platforms/woocommerce/services/woocommerce-orders.service';
export { WooCommerceResolver } from './lib/platforms/woocommerce/woocommerce.resolver';

// Common contracts
export * from './lib/common/interfaces/ecommerce-platform.interface';
export {
  EcommercePlatformFactory,
  PlatformType,
} from './lib/common/factories/ecommerce-platform.factory';

// SS-026 — channel-agnostic sync stack re-exports.
// The Shopify + WooCommerce adapters now live in `@swiftship/domains-channels`
// (see `libs/domains/channels/src/lib/sync/adapters/`). This re-export bridges
// callers that have already imported them via the ecommerce-integrations barrel.
export {
  ShopifyChannelAdapter,
  WooCommerceChannelAdapter,
  ChannelSyncModule,
  ChannelSyncService,
  ChannelSyncResolver,
  ChannelSyncScheduler,
  ChannelConnectionEntity,
  ChannelSyncJobEntity,
} from '@swiftship/domains-channels';
export type {
  ChannelPlatform,
  ChannelConnectionStatus,
  ChannelSyncType,
  ChannelSyncStatus,
  ChannelConnectionStatusReport,
  PulledProduct,
  PulledOrder,
  ShipmentPushPayload,
  TrackingPushPayload,
  ChannelPushResult,
  ChannelWebhookRegistration,
  ChannelSettings,
} from '@swiftship/domains-channels';
export type { EcomChannelAdapter } from '@swiftship/domains-channels';
