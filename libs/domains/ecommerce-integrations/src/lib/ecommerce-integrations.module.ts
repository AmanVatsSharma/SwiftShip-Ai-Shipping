import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ShopifyStoreEntity,
  ShopifyOrderEntity,
  ShopifyWebhookEventEntity,
  WooCommerceStoreEntity,
  WooCommerceOrderEntity,
} from '@swiftship/platform-typeorm';
import { ecommerceIntegrationsConfig } from './ecommerce-integrations.config';
import { EcommercePlatformFactory } from './common/factories/ecommerce-platform.factory';
import { ShopifyModule } from './platforms/shopify/shopify.module';
import { WooCommerceModule } from './platforms/woocommerce/woocommerce.module';

/**
 * eCommerce Integrations Module
 *
 * This module handles all integrations with external eCommerce platforms
 * such as Shopify, WooCommerce, etc. It provides services and resolvers
 * for connecting to stores, syncing orders, and managing products.
 *
 * The module is organized by platform, with each platform having its own module
 * that encapsulates all the functionality specific to that platform.
 *
 * Persistence is TypeORM-only since the SS-101 decommission: each platform
 * sub-module registers the entities it needs via `TypeOrmModule.forFeature`.
 */
@Module({
  imports: [
    ConfigModule.forFeature(ecommerceIntegrationsConfig),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    // Entities used by the factory-level services (platform sub-modules
    // register their own forFeature sets).
    TypeOrmModule.forFeature([
      ShopifyStoreEntity,
      ShopifyOrderEntity,
      ShopifyWebhookEventEntity,
      WooCommerceStoreEntity,
      WooCommerceOrderEntity,
    ]),
    // Platform-specific modules
    ShopifyModule,
    WooCommerceModule,
    // Add other platform modules here in the future
    // MagentoModule,
    // etc.
  ],
  providers: [
    // Platform factory
    EcommercePlatformFactory,
  ],
  exports: [
    // Services that can be used by other modules
    EcommercePlatformFactory,
    // Re-export platform modules
    ShopifyModule,
    WooCommerceModule,
  ],
})
export class EcommerceIntegrationsModule {}
