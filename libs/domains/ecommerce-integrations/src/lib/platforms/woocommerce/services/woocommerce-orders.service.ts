import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

/**
 * WooCommerce Orders Service
 * 
 * Handles WooCommerce order synchronization.
 * 
 * Features:
 * - Fetch orders from WooCommerce
 * - Sync orders to local database
 * - Map WooCommerce order format to internal format
 * 
 * Flow:
 * 1. Fetch orders from WooCommerce API
 * 2. Map order data to internal format
 * 3. Create/update order records
 * 4. Handle order status updates
 * 
 * Error Handling:
 * - Validates store connection
 * - Handles API errors
 * - Skips duplicate orders
 * - Comprehensive logging
 */
@Injectable()
export class WooCommerceOrdersService {
  private readonly logger = new Logger(WooCommerceOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Sync orders from WooCommerce store
   * @param storeId - Store ID
   * @param userId - User ID (for authorization)
   * @param limit - Number of orders to fetch (default: 100)
   * @returns Number of orders synced
   */
  async syncOrders(storeId: string, userId: number, limit: number = 100) {
    this.logger.log('Syncing WooCommerce orders', {
      storeId,
      userId,
      limit,
    });

    // Get store
    const store = await this.prisma.wooCommerceStore.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }

    if (store.userId !== userId) {
      throw new BadRequestException('Store does not belong to user');
    }

    try {
      // Fetch orders from WooCommerce
      const orders = await this.fetchOrdersFromWooCommerce(store, limit);

      let syncedCount = 0;

      // Sync each order
      for (const order of orders) {
        try {
          await this.syncOrder(store.id, order);
          syncedCount++;
        } catch (error) {
          this.logger.error('Failed to sync order', {
            storeId,
            orderNumber: order.number,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.logger.log('WooCommerce orders synced', {
        storeId,
        syncedCount,
        totalFetched: orders.length,
      });

      return { synced: syncedCount, total: orders.length };
    } catch (error) {
      this.logger.error('Failed to sync WooCommerce orders', {
        storeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get orders from store
   */
  async getOrdersByStore(storeId: string, userId: number) {
    const store = await this.prisma.wooCommerceStore.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }

    if (store.userId !== userId) {
      throw new BadRequestException('Store does not belong to user');
    }

    return this.prisma.wooCommerceOrder.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string, userId: number) {
    const order = await this.prisma.wooCommerceOrder.findUnique({
      where: { id: orderId },
      include: { store: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.store.userId !== userId) {
      throw new BadRequestException('Order does not belong to user');
    }

    return order;
  }

  /**
   * Fetch orders from WooCommerce API
   */
  private async fetchOrdersFromWooCommerce(store: any, limit: number): Promise<any[]> {
    const apiUrl = `${store.storeUrl}/wp-json/wc/v3/orders`;
    const auth = Buffer.from(`${store.consumerKey}:${store.consumerSecret}`).toString('base64');

    try {
      const response = await firstValueFrom(
        this.httpService.get(apiUrl, {
          headers: {
            Authorization: `Basic ${auth}`,
          },
          params: {
            per_page: limit,
            orderby: 'date',
            order: 'desc',
          },
          timeout: 30000,
        })
      );

      return response.data || [];
    } catch (error: any) {
      this.logger.error('Failed to fetch orders from WooCommerce', {
        storeUrl: store.storeUrl,
        error: error?.response?.data || error?.message || 'Unknown error',
      });
      throw new Error('Failed to fetch orders from WooCommerce');
    }
  }

  /**
   * Sync a single order
   */
  private async syncOrder(storeId: string, woocommerceOrder: any): Promise<void> {
    const orderNumber = woocommerceOrder.number?.toString() || woocommerceOrder.id?.toString();

    if (!orderNumber) {
      throw new Error('Order number is required');
    }

    // Check if order already exists
    const existingOrder = await this.prisma.wooCommerceOrder.findUnique({
      where: { orderNumber },
    });

    const orderData = {
      orderNumber,
      total: parseFloat(woocommerceOrder.total || '0'),
      status: this.mapWooCommerceStatus(woocommerceOrder.status),
      storeId,
      woocommerceCreatedAt: woocommerceOrder.date_created
        ? new Date(woocommerceOrder.date_created)
        : null,
      currency: woocommerceOrder.currency || 'INR',
      customerEmail: woocommerceOrder.billing?.email || null,
      customerName: woocommerceOrder.billing
        ? `${woocommerceOrder.billing.first_name || ''} ${woocommerceOrder.billing.last_name || ''}`.trim()
        : null,
    };

    if (existingOrder) {
      // Update existing order
      await this.prisma.wooCommerceOrder.update({
        where: { id: existingOrder.id },
        data: {
          ...orderData,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new order
      await this.prisma.wooCommerceOrder.create({
        data: {
          id: crypto.randomUUID(),
          ...orderData,
        },
      });
    }
  }

  /**
   * Map WooCommerce order status to internal format
   */
  private mapWooCommerceStatus(status: string): string {
    const statusMap: Record<string, string> = {
      pending: 'PENDING',
      processing: 'PROCESSING',
      on_hold: 'ON_HOLD',
      completed: 'COMPLETED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
      failed: 'FAILED',
    };

    return statusMap[status.toLowerCase()] || status.toUpperCase();
  }
}
