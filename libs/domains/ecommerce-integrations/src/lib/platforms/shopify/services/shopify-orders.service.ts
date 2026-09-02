import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopifyOrderEntity } from '@swiftship/platform-typeorm';
import {
  CreateShopifyOrderInput,
  ShopifyOrderStatus,
} from '../dto/create-shopify-order.input';
import { ShopifyOrder } from '../models/shopify-order.model';
import { ShopifyIntegrationService } from './shopify-integration.service';

/** Narrow an unknown thrown value to an Error for safe logging. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Shopify orders service (TypeORM-backed, SS-101 decommission port).
 *
 * Prisma → TypeORM call-site mapping (see MIGRATION.md §7):
 *   prisma.shopifyOrder.findMany(...)  → repo.find({ where, order })
 *   prisma.shopifyOrder.findUnique()   → repo.findOne({ where })
 *   prisma.shopifyOrder.create(...)    → repo.create + repo.save
 *   prisma.shopifyOrder.update(...)    → Object.assign + repo.save
 *   prisma.shopifyOrder.delete(...)    → repo.remove
 */
@Injectable()
export class ShopifyOrdersService {
  private readonly logger = new Logger(ShopifyOrdersService.name);

  constructor(
    @InjectRepository(ShopifyOrderEntity)
    private readonly orders: Repository<ShopifyOrderEntity>,
    private shopifyIntegrationService: ShopifyIntegrationService,
  ) {}

  async getShopifyOrders(): Promise<ShopifyOrder[]> {
    try {
      const orders = await this.orders.find({
        order: { createdAt: 'DESC' },
      });
      return orders.map((order) => this.mapOrderEntityToModel(order));
    } catch (error) {
      this.logger.error(
        'Failed to retrieve Shopify orders',
        toError(error).stack,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve Shopify orders',
      );
    }
  }

  async getOrdersByStore(storeId: string): Promise<ShopifyOrder[]> {
    try {
      // Check if store exists
      await this.shopifyIntegrationService.getStoreById(storeId);

      const orders = await this.orders.find({
        where: { storeId },
        order: { createdAt: 'DESC' },
      });
      return orders.map((order) => this.mapOrderEntityToModel(order));
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to retrieve orders for store: ${storeId}`,
        toError(error).stack,
      );
      throw new InternalServerErrorException(
        `Failed to retrieve orders for store: ${toError(error).message}`,
      );
    }
  }

  async getOrderById(id: string): Promise<ShopifyOrder> {
    try {
      const order = await this.orders.findOne({ where: { id } });

      if (!order) {
        throw new NotFoundException(`Shopify order with ID ${id} not found`);
      }

      return this.mapOrderEntityToModel(order);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to retrieve order ${id}`, toError(error).stack);
      throw new InternalServerErrorException(
        `Failed to retrieve order: ${toError(error).message}`,
      );
    }
  }

  async createOrder(
    createOrderInput: CreateShopifyOrderInput,
  ): Promise<ShopifyOrder> {
    try {
      // Verify the store exists
      await this.shopifyIntegrationService.getStoreById(
        createOrderInput.storeId,
      );

      const order = this.orders.create({
        orderNumber: createOrderInput.orderNumber,
        total: createOrderInput.total,
        status: createOrderInput.status,
        storeId: createOrderInput.storeId,
      });
      const saved = await this.orders.save(order);

      return this.mapOrderEntityToModel(saved);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to create Shopify order: ${toError(error).message}`,
        toError(error).stack,
      );
      throw new BadRequestException(
        `Failed to create Shopify order: ${toError(error).message}`,
      );
    }
  }

  async updateOrderStatus(
    id: string,
    status: ShopifyOrderStatus,
  ): Promise<ShopifyOrder> {
    try {
      // Verify the order exists (throws NotFoundException otherwise)
      const order = await this.orders.findOne({ where: { id } });

      if (!order) {
        throw new NotFoundException(`Shopify order with ID ${id} not found`);
      }

      order.status = status;
      const updated = await this.orders.save(order);

      return this.mapOrderEntityToModel(updated);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update order status: ${toError(error).message}`,
        toError(error).stack,
      );
      throw new BadRequestException(
        `Failed to update order status: ${toError(error).message}`,
      );
    }
  }

  async deleteOrder(id: string): Promise<ShopifyOrder> {
    try {
      // Verify the order exists
      const order = await this.orders.findOne({ where: { id } });

      if (!order) {
        throw new NotFoundException(`Shopify order with ID ${id} not found`);
      }

      const removed = await this.orders.remove(order);

      return this.mapOrderEntityToModel(removed);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete order: ${toError(error).message}`,
        toError(error).stack,
      );
      throw new BadRequestException(
        `Failed to delete order: ${toError(error).message}`,
      );
    }
  }

  private mapOrderEntityToModel(order: ShopifyOrderEntity): ShopifyOrder {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      status: order.status,
      storeId: order.storeId,
      shopifyCreatedAt: order.shopifyCreatedAt ?? undefined,
      processedAt: order.processedAt ?? undefined,
      currency: order.currency ?? undefined,
      customerEmail: order.customerEmail ?? undefined,
      customerName: order.customerName ?? undefined,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
