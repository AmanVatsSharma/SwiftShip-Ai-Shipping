import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { ConnectStoreInput } from '../dto/connect-store.input';
import { ShopifyStore } from '../models/shopify-store.model';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EcommercePlatform } from '../../../common/interfaces/ecommerce-platform.interface';

@Injectable()
export class ShopifyIntegrationService implements EcommercePlatform<ShopifyStore, any, any, ConnectStoreInput> {
  private readonly logger = new Logger(ShopifyIntegrationService.name);
  private readonly apiVersion: string;
  
  constructor(
    private httpService: HttpService,
    private prisma: PrismaService,
    private configService: ConfigService
  ) {
    this.apiVersion = this.configService.get<string>('ecommerceIntegrations.shopify.apiVersion', '2023-10');
    this.logger.log(`Using Shopify API version: ${this.apiVersion}`);
  }

  async registerDefaultWebhooks(shopDomain: string, accessToken: string): Promise<void> {
    const appUrl = this.configService.get<string>('ecommerceIntegrations.shopify.appUrl') ?? '';
    const topics = ['orders/create', 'orders/updated'];
    const version = this.apiVersion;
    const baseUrl = `https://${shopDomain}/admin/api/${version}/webhooks.json`;
    for (const topic of topics) {
      try {
        await lastValueFrom(
          this.httpService.post(
            baseUrl,
            {
              webhook: {
                topic,
                address: `${appUrl}/shopify/webhook`,
                format: 'json',
              },
            },
            {
              headers: { 'X-Shopify-Access-Token': accessToken },
              timeout: 8000,
            }
          )
        );
        this.logger.log(`Registered Shopify webhook: ${topic}`);
      } catch (error) {
        this.logger.error(`Failed to register webhook ${topic}: ${error?.message ?? error}`);
      }
    }
  }

  async connectStore(connectStoreInput: ConnectStoreInput): Promise<ShopifyStore> {
    this.logger.log(`Connecting Shopify store: ${connectStoreInput.shopDomain}`);
    
    try {
      // Verify the store and access token with Shopify
      await this.verifyCredentials(connectStoreInput);
      
      // Store the connection in the database
      const now = new Date();
      const store = await this.prisma.shopifyStore.create({
        data: {
          shopDomain: connectStoreInput.shopDomain,
          accessToken: connectStoreInput.accessToken,
          connectedAt: now,
          updatedAt: now,
        },
      });
      
      return this.mapPrismaShopifyStoreToModel(store);
    } catch (error) {
      this.logger.error(`Failed to connect Shopify store: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to connect Shopify store: ${error.message}`);
    }
  }
  
  async getStores(): Promise<ShopifyStore[]> {
    try {
      const stores = await this.prisma.shopifyStore.findMany();
      return stores.map(store => this.mapPrismaShopifyStoreToModel(store));
    } catch (error) {
      this.logger.error(`Failed to get Shopify stores: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to get Shopify stores: ${error.message}`);
    }
  }
  
  async getStoreById(id: string): Promise<ShopifyStore> {
    try {
      const store = await this.prisma.shopifyStore.findUnique({
        where: { id },
      });
      
      if (!store) {
        throw new NotFoundException(`Shopify store with ID ${id} not found`);
      }
      
      return this.mapPrismaShopifyStoreToModel(store);
    } catch (error) {
      this.logger.error(`Failed to get Shopify store ${id}: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to get Shopify store: ${error.message}`);
    }
  }
  
  async disconnectStore(id: string): Promise<ShopifyStore> {
    try {
      // Verify the store exists
      const store = await this.prisma.shopifyStore.findUnique({
        where: { id },
      });
      
      if (!store) {
        throw new NotFoundException(`Shopify store with ID ${id} not found`);
      }
      
      // Check if there are orders associated with this store
      const orderCount = await this.prisma.shopifyOrder.count({
        where: { storeId: id },
      });
      
      if (orderCount > 0) {
        throw new BadRequestException(
          `Cannot disconnect store with ${orderCount} orders. Please delete orders first.`
        );
      }
      
      // Delete the store
      const deletedStore = await this.prisma.shopifyStore.delete({
        where: { id },
      });
      
      return this.mapPrismaShopifyStoreToModel(deletedStore);
    } catch (error) {
      this.logger.error(`Failed to disconnect Shopify store ${id}: ${error.message}`, error.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to disconnect Shopify store: ${error.message}`);
    }
  }
  
  async syncOrders(storeId: string): Promise<any[]> {
    // Implementation would use the Shopify API to sync orders
    this.logger.log(`Syncing orders for Shopify store ${storeId}`);
    
    try {
      const store = await this.getStoreById(storeId);
      
      // Fetch orders from Shopify API
      // This would be expanded in a real implementation
      // return this.fetchOrdersFromShopify(store);
      
      return [];
    } catch (error) {
      this.logger.error(`Failed to sync orders for store ${storeId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to sync orders: ${error.message}`);
    }
  }
  
  async getProducts(storeId: string): Promise<any[]> {
    // Implementation would use the Shopify API to fetch products
    this.logger.log(`Fetching products for Shopify store ${storeId}`);
    
    try {
      const store = await this.getStoreById(storeId);
      
      // Fetch products from Shopify API
      // This would be expanded in a real implementation
      // return this.fetchProductsFromShopify(store);
      
      return [];
    } catch (error) {
      this.logger.error(`Failed to fetch products for store ${storeId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to fetch products: ${error.message}`);
    }
  }
  
  async verifyCredentials(credentials: ConnectStoreInput): Promise<void> {
    try {
      const { shopDomain, accessToken } = credentials;
      
      // Verify the store and access token with Shopify API
      const url = `https://${shopDomain}/admin/api/${this.apiVersion}/shop.json`;
      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
          },
        })
      );
      
      if (response.status !== 200) {
        throw new BadRequestException('Invalid Shopify credentials');
      }
      
      this.logger.log(`Successfully verified Shopify credentials for ${shopDomain}`);
    } catch (error) {
      this.logger.error(`Failed to verify Shopify credentials: ${error.message}`, error.stack);
      throw new BadRequestException('Invalid Shopify credentials');
    }
  }
  
  private mapPrismaShopifyStoreToModel(store: any): ShopifyStore {
    return {
      id: store.id,
      shopDomain: store.shopDomain,
      accessToken: store.accessToken,
      connectedAt: store.connectedAt,
      updatedAt: store.updatedAt,
    };
  }
} 