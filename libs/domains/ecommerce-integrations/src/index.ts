// Re-export barrel for the e-commerce integrations lib.
// This lib wraps Shopify, WooCommerce, and other e-com platform connectors
// under a single module boundary. Sub-platforms (shopify/, woocommerce/)
// have their own sub-modules with controllers, services, and resolvers.

export { EcommerceIntegrationsModule, EcommerceIntegrationsModule as EcommerceIntegrationsLibModule } from '../../../../src/ecommerce-integrations/ecommerce-integrations.module';
export { ecommerceIntegrationsConfig } from '../../../../src/ecommerce-integrations/ecommerce-integrations.config';

// Shopify sub-platform
export { ShopifyModule } from '../../../../src/ecommerce-integrations/platforms/shopify/shopify.module';
export { ShopifyIntegrationService } from '../../../../src/ecommerce-integrations/platforms/shopify/services/shopify-integration.service';
export { ShopifyOrdersService } from '../../../../src/ecommerce-integrations/platforms/shopify/services/shopify-orders.service';
export { ShopifyIntegrationResolver } from '../../../../src/ecommerce-integrations/platforms/shopify/resolvers/shopify-integration.resolver';
export { ShopifyOrdersResolver } from '../../../../src/ecommerce-integrations/platforms/shopify/resolvers/shopify-orders.resolver';
export { ShopifyController } from '../../../../src/ecommerce-integrations/platforms/shopify/shopify.controller';
export { ShopifyWebhookController } from '../../../../src/ecommerce-integrations/platforms/shopify/shopify.webhook.controller';

// WooCommerce sub-platform
export { WooCommerceModule } from '../../../../src/ecommerce-integrations/platforms/woocommerce/woocommerce.module';
export { WooCommerceIntegrationService } from '../../../../src/ecommerce-integrations/platforms/woocommerce/services/woocommerce-integration.service';
export { WooCommerceOrdersService } from '../../../../src/ecommerce-integrations/platforms/woocommerce/services/woocommerce-orders.service';
export { WooCommerceResolver } from '../../../../src/ecommerce-integrations/platforms/woocommerce/woocommerce.resolver';

// Common contracts
export * from '../../../../src/ecommerce-integrations/common/interfaces/ecommerce-platform.interface';
export { EcommercePlatformFactory } from '../../../../src/ecommerce-integrations/common/factories/ecommerce-platform.factory';

// SS-026 — channel-agnostic sync stack re-exports.
// The Shopify + WooCommerce adapters now live in `@swiftship/domains-channels`
// (see `libs/domains/channels/src/lib/sync/adapters/`). The legacy services
// above continue to work; this re-export bridges callers that have already
// imported them via the ecommerce-integrations barrel.
export {
  ShopifyChannelAdapter,
  WooCommerceChannelAdapter,
  ChannelSyncModule,
  ChannelSyncService,
  ChannelSyncResolver,
  ChannelSyncScheduler,
  ChannelConnectionEntity,
  ChannelSyncJobEntity,
} from '../../../../domains/channels/src';
export type {
  EcomChannelAdapter,
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
} from '../../../../domains/channels/src/lib/sync/channel-sync.types';
