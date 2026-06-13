import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateShopifyOrderInput, ShopifyOrderStatus } from '../dto/create-shopify-order.input';
import { ShopifyOrder } from '../models/shopify-order.model';
import { ShopifyIntegrationService } from './shopify-integration.service';

@Injectable()
export class ShopifyOrdersService {
  private readonly logger = new Logger(ShopifyOrdersService.name);

  constructor(
    private prisma: PrismaService,
    private shopifyIntegrationService: ShopifyIntegrationService
  ) {}

  async getShopifyOrders(): Promise<ShopifyOrder[]> {
    try {
      const orders = await this.prisma.shopifyOrder.findMany({
        orderBy: { createdAt: 'desc' }
      });
      return orders.map(order => this.mapPrismaOrderToModel(order));
    } catch (error) {
      this.logger.error('Failed to retrieve Shopify orders', error.stack);
      throw new InternalServerErrorException('Failed to retrieve Shopify orders');
    }
  }

  async getOrdersByStore(storeId: string): Promise<ShopifyOrder[]> {
    try {
      // Check if store exists
      await this.shopifyIntegrationService.getStoreById(storeId);
      
      const orders = await this.prisma.shopifyOrder.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' }
      });
      return orders.map(order => this.mapPrismaOrderToModel(order));
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to retrieve orders for store: ${storeId}`, error.stack);
      throw new InternalServerErrorException(`Failed to retrieve orders for store: ${error.message}`);
    }
  }

  async getOrderById(id: string): Promise<ShopifyOrder> {
    try {
      const order = await this.prisma.shopifyOrder.findUnique({
        where: { id }
      });
      
      if (!order) {
        throw new NotFoundException(`Shopify order with ID ${id} not found`);
      }
      
      return this.mapPrismaOrderToModel(order);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to retrieve order ${id}`, error.stack);
      throw new InternalServerErrorException(`Failed to retrieve order: ${error.message}`);
    }
  }
  
  async createOrder(createOrderInput: CreateShopifyOrderInput): Promise<ShopifyOrder> {
    try {
      // Verify the store exists
      await this.shopifyIntegrationService.getStoreById(createOrderInput.storeId);
      
      const now = new Date();
      const order = await this.prisma.shopifyOrder.create({
        data: {
          orderNumber: createOrderInput.orderNumber,
          total: createOrderInput.total,
          status: createOrderInput.status,
          storeId: createOrderInput.storeId,
          createdAt: now,
          updatedAt: now,
        }
      });
      
      return this.mapPrismaOrderToModel(order);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to create Shopify order: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to create Shopify order: ${error.message}`);
    }
  }
  
  async updateOrderStatus(id: string, status: ShopifyOrderStatus): Promise<ShopifyOrder> {
    try {
      // Verify the order exists
      const existingOrder = await this.getOrderById(id);
      
      const order = await this.prisma.shopifyOrder.update({
        where: { id },
        data: {
          status,
          updatedAt: new Date(),
        }
      });
      
      return this.mapPrismaOrderToModel(order);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update order status: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to update order status: ${error.message}`);
    }
  }
  
  async deleteOrder(id: string): Promise<ShopifyOrder> {
    try {
      // Verify the order exists
      await this.getOrderById(id);
      
      const order = await this.prisma.shopifyOrder.delete({
        where: { id }
      });
      
      return this.mapPrismaOrderToModel(order);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete order: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to delete order: ${error.message}`);
    }
  }
  
  private mapPrismaOrderToModel(order: any): ShopifyOrder {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      status: order.status,
      storeId: order.storeId,
      shopifyCreatedAt: order.shopifyCreatedAt,
      processedAt: order.processedAt,
      currency: order.currency,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
} 