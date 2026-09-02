import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import {
  WooCommerceStoreEntity,
  WooCommerceOrderEntity,
} from '@swiftship/platform-typeorm';
import { WooCommerceIntegrationService } from './services/woocommerce-integration.service';
import { WooCommerceOrdersService } from './services/woocommerce-orders.service';
import { WooCommerceResolver } from './woocommerce.resolver';

/**
 * WooCommerce Module
 *
 * Handles WooCommerce e-commerce platform integration.
 *
 * Features:
 * - Store connection management
 * - Order synchronization
 * - Product synchronization (future)
 *
 * Dependencies:
 * - TypeORM repositories: Database access (SS-101 decommission port)
 * - HttpModule: HTTP requests to WooCommerce API
 * - AuthLibModule: GqlAuthGuard backing for the resolver
 */
@Module({
  imports: [
    HttpModule,
    AuthLibModule,
    TypeOrmModule.forFeature([WooCommerceStoreEntity, WooCommerceOrderEntity]),
  ],
  providers: [
    WooCommerceIntegrationService,
    WooCommerceOrdersService,
    WooCommerceResolver,
  ],
  exports: [WooCommerceIntegrationService, WooCommerceOrdersService],
})
export class WooCommerceModule {}
