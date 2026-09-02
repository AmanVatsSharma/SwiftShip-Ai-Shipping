import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  WooCommerceOrderEntity,
  WooCommerceStoreEntity,
} from '@swiftship/platform-typeorm';

/**
 * Minimal shape of a WooCommerce REST v3 order payload — only the fields the
 * sync consumes. The upstream API returns far more; this keeps the sync
 * type-safe without modeling the whole contract.
 */
interface WooCommerceRemoteOrder {
  id?: number | string;
  number?: number | string;
  total?: string;
  status?: string;
  currency?: string;
  date_created?: string;
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

/** Describe an unknown thrown value for structured logging. */
function describeError(error: unknown): unknown {
  if (error instanceof AxiosError) {
    return error.response?.data || error.message || 'Unknown error';
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * WooCommerce Orders Service (TypeORM-backed, SS-101 decommission port)
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
 *
 * Prisma → TypeORM call-site mapping (see MIGRATION.md §7):
 *   prisma.wooCommerceOrder.findUnique({ include }) → repo.findOne({ where, relations })
 *   prisma.wooCommerceOrder.findMany(...)           → repo.find({ where, order })
 *   prisma.wooCommerceOrder.create(...)             → repo.create + repo.save
 *   prisma.wooCommerceOrder.update(...)             → Object.assign + repo.save
 */
@Injectable()
export class WooCommerceOrdersService {
  private readonly logger = new Logger(WooCommerceOrdersService.name);

  constructor(
    @InjectRepository(WooCommerceOrderEntity)
    private readonly orders: Repository<WooCommerceOrderEntity>,
    @InjectRepository(WooCommerceStoreEntity)
    private readonly stores: Repository<WooCommerceStoreEntity>,
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
    const store = await this.stores.findOne({ where: { id: storeId } });

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
            error: describeError(error),
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
        error: describeError(error),
      });
      throw error;
    }
  }

  /**
   * Get orders from store
   */
  async getOrdersByStore(storeId: string, userId: number) {
    const store = await this.stores.findOne({ where: { id: storeId } });

    if (!store) {
      throw new NotFoundException(`Store with ID ${storeId} not found`);
    }

    if (store.userId !== userId) {
      throw new BadRequestException('Store does not belong to user');
    }

    return this.orders.find({
      where: { storeId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string, userId: number) {
    const order = await this.orders.findOne({
      where: { id: orderId },
      relations: { store: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.store?.userId !== userId) {
      throw new BadRequestException('Order does not belong to user');
    }

    return order;
  }

  /**
   * Fetch orders from WooCommerce API
   */
  private async fetchOrdersFromWooCommerce(
    store: Pick<
      WooCommerceStoreEntity,
      'storeUrl' | 'consumerKey' | 'consumerSecret'
    >,
    limit: number,
  ): Promise<WooCommerceRemoteOrder[]> {
    const apiUrl = `${store.storeUrl}/wp-json/wc/v3/orders`;
    const auth = Buffer.from(
      `${store.consumerKey}:${store.consumerSecret}`,
    ).toString('base64');

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
        }),
      );

      return (response.data as WooCommerceRemoteOrder[]) || [];
    } catch (error) {
      this.logger.error('Failed to fetch orders from WooCommerce', {
        storeUrl: store.storeUrl,
        error: describeError(error),
      });
      throw new Error('Failed to fetch orders from WooCommerce');
    }
  }

  /**
   * Sync a single order
   */
  private async syncOrder(
    storeId: string,
    woocommerceOrder: WooCommerceRemoteOrder,
  ): Promise<void> {
    const orderNumber =
      woocommerceOrder.number?.toString() || woocommerceOrder.id?.toString();

    if (!orderNumber) {
      throw new Error('Order number is required');
    }

    // Check if order already exists
    const existingOrder = await this.orders.findOne({ where: { orderNumber } });

    const orderData = {
      orderNumber,
      total: parseFloat(woocommerceOrder.total || '0'),
      status: this.mapWooCommerceStatus(woocommerceOrder.status ?? ''),
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
      Object.assign(existingOrder, orderData);
      await this.orders.save(existingOrder);
    } else {
      // Create new order
      await this.orders.save(this.orders.create(orderData));
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
