import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';

import { ShopifyIntegrationService } from './services/shopify-integration.service';
import { ShopifyOrdersService } from './services/shopify-orders.service';
import { ShopifyIntegrationResolver } from './resolvers/shopify-integration.resolver';
import { ShopifyOrdersResolver } from './resolvers/shopify-orders.resolver';
import { ShopifyController } from './shopify.controller';
import { ShopifyWebhookController } from './shopify.webhook.controller';

/**
 * Shopify Integration Module
 * 
 * This module provides all services and resolvers needed for Shopify integration,
 * including store connection management, order synchronization, and product retrieval.
 */
@Module({
  imports: [
    HttpModule,
    ConfigModule,
    PrismaModule,
  ],
  providers: [
    ShopifyIntegrationService,
    ShopifyOrdersService,
    ShopifyIntegrationResolver,
    ShopifyOrdersResolver,
  ],
  exports: [
    ShopifyIntegrationService,
    ShopifyOrdersService,
  ],
  controllers: [ShopifyController, ShopifyWebhookController],
})
export class ShopifyModule {} 