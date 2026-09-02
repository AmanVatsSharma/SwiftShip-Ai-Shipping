import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { lastValueFrom } from 'rxjs';
import {
  ShopifyStoreEntity,
  ShopifyOrderEntity,
} from '@swiftship/platform-typeorm';
import { ConnectStoreInput } from '../dto/connect-store.input';
import { ShopifyStore } from '../models/shopify-store.model';
import { EcommercePlatform } from '../../../common/interfaces/ecommerce-platform.interface';

/** Narrow an unknown thrown value to an Error for safe logging. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Shopify integration service (TypeORM-backed, SS-101 decommission port).
 *
 * Prisma → TypeORM call-site mapping (see MIGRATION.md §7):
 *   prisma.shopifyStore.create(...)   → repo.create + repo.save
 *   prisma.shopifyStore.findMany()    → repo.find()
 *   prisma.shopifyStore.findUnique()  → repo.findOne({ where })
 *   prisma.shopifyStore.delete(...)   → repo.remove
 *   prisma.shopifyOrder.count(...)    → repo.count({ where })
 */
@Injectable()
export class ShopifyIntegrationService
  implements EcommercePlatform<ShopifyStore, any, any, ConnectStoreInput>
{
  private readonly logger = new Logger(ShopifyIntegrationService.name);
  private readonly apiVersion: string;

  constructor(
    private httpService: HttpService,
    @InjectRepository(ShopifyStoreEntity)
    private readonly stores: Repository<ShopifyStoreEntity>,
    @InjectRepository(ShopifyOrderEntity)
    private readonly orders: Repository<ShopifyOrderEntity>,
    private configService: ConfigService,
  ) {
    this.apiVersion = this.configService.get<string>(
      'ecommerceIntegrations.shopify.apiVersion',
      '2023-10',
    );
    this.logger.log(`Using Shopify API version: ${this.apiVersion}`);
  }

  async registerDefaultWebhooks(
    shopDomain: string,
    accessToken: string,
  ): Promise<void> {
    const appUrl =
      this.configService.get<string>('ecommerceIntegrations.shopify.appUrl') ??
      '';
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
            },
          ),
        );
        this.logger.log(`Registered Shopify webhook: ${topic}`);
      } catch (error) {
        const err = toError(error);
        this.logger.error(
          `Failed to register webhook ${topic}: ${err.message}`,
        );
      }
    }
  }

  async connectStore(
    connectStoreInput: ConnectStoreInput,
  ): Promise<ShopifyStore> {
    this.logger.log(
      `Connecting Shopify store: ${connectStoreInput.shopDomain}`,
    );

    try {
      // Verify the store and access token with Shopify
      await this.verifyCredentials(connectStoreInput);

      // Store the connection in the database
      const store = this.stores.create({
        shopDomain: connectStoreInput.shopDomain,
        accessToken: connectStoreInput.accessToken,
      });
      const saved = await this.stores.save(store);

      return this.mapStoreEntityToModel(saved);
    } catch (error) {
      const err = toError(error);
      this.logger.error(
        `Failed to connect Shopify store: ${err.message}`,
        err.stack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to connect Shopify store: ${err.message}`,
      );
    }
  }

  async getStores(): Promise<ShopifyStore[]> {
    try {
      const stores = await this.stores.find();
      return stores.map((store) => this.mapStoreEntityToModel(store));
    } catch (error) {
      const err = toError(error);
      this.logger.error(
        `Failed to get Shopify stores: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        `Failed to get Shopify stores: ${err.message}`,
      );
    }
  }

  async getStoreById(id: string): Promise<ShopifyStore> {
    try {
      const store = await this.stores.findOne({ where: { id } });

      if (!store) {
        throw new NotFoundException(`Shopify store with ID ${id} not found`);
      }

      return this.mapStoreEntityToModel(store);
    } catch (error) {
      const err = toError(error);
      this.logger.error(
        `Failed to get Shopify store ${id}: ${err.message}`,
        err.stack,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to get Shopify store: ${err.message}`,
      );
    }
  }

  async disconnectStore(id: string): Promise<ShopifyStore> {
    try {
      // Verify the store exists
      const store = await this.stores.findOne({ where: { id } });

      if (!store) {
        throw new NotFoundException(`Shopify store with ID ${id} not found`);
      }

      // Check if there are orders associated with this store
      const orderCount = await this.orders.count({ where: { storeId: id } });

      if (orderCount > 0) {
        throw new BadRequestException(
          `Cannot disconnect store with ${orderCount} orders. Please delete orders first.`,
        );
      }

      // Delete the store
      const deletedStore = await this.stores.remove(store);

      return this.mapStoreEntityToModel(deletedStore);
    } catch (error) {
      const err = toError(error);
      this.logger.error(
        `Failed to disconnect Shopify store ${id}: ${err.message}`,
        err.stack,
      );
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to disconnect Shopify store: ${err.message}`,
      );
    }
  }

  async syncOrders(storeId: string): Promise<any[]> {
    // Implementation would use the Shopify API to sync orders
    this.logger.log(`Syncing orders for Shopify store ${storeId}`);

    try {
      // Validates that the store exists (throws NotFoundException otherwise)
      await this.getStoreById(storeId);

      // Fetch orders from Shopify API
      // This would be expanded in a real implementation
      // return this.fetchOrdersFromShopify(store);

      return [];
    } catch (error) {
      const err = toError(error);
      this.logger.error(
        `Failed to sync orders for store ${storeId}: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        `Failed to sync orders: ${err.message}`,
      );
    }
  }

  async getProducts(storeId: string): Promise<any[]> {
    // Implementation would use the Shopify API to fetch products
    this.logger.log(`Fetching products for Shopify store ${storeId}`);

    try {
      // Validates that the store exists (throws NotFoundException otherwise)
      await this.getStoreById(storeId);

      // Fetch products from Shopify API
      // This would be expanded in a real implementation
      // return this.fetchProductsFromShopify(store);

      return [];
    } catch (error) {
      const err = toError(error);
      this.logger.error(
        `Failed to fetch products for store ${storeId}: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        `Failed to fetch products: ${err.message}`,
      );
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
        }),
      );

      if (response.status !== 200) {
        throw new BadRequestException('Invalid Shopify credentials');
      }

      this.logger.log(
        `Successfully verified Shopify credentials for ${shopDomain}`,
      );
    } catch (error) {
      const err = toError(error);
      this.logger.error(
        `Failed to verify Shopify credentials: ${err.message}`,
        err.stack,
      );
      throw new BadRequestException('Invalid Shopify credentials');
    }
  }

  private mapStoreEntityToModel(store: ShopifyStoreEntity): ShopifyStore {
    return {
      id: store.id,
      shopDomain: store.shopDomain,
      accessToken: store.accessToken,
      connectedAt: store.connectedAt,
      updatedAt: store.updatedAt,
    };
  }
}
