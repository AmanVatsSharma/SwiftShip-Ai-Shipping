import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../../../prisma/prisma.service';
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
 * - PrismaService: Database access
 * - HttpModule: HTTP requests to WooCommerce API
 */
@Module({
  imports: [HttpModule],
  providers: [
    PrismaService,
    WooCommerceIntegrationService,
    WooCommerceOrdersService,
    WooCommerceResolver,
  ],
  exports: [WooCommerceIntegrationService, WooCommerceOrdersService],
})
export class WooCommerceModule {}
