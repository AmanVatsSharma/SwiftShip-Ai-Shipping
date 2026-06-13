import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ShopifyStore } from '../models/shopify-store.model';
import { ShopifyIntegrationService } from '../services/shopify-integration.service';
import { ConnectStoreInput } from '../dto/connect-store.input';

@Resolver(() => ShopifyStore)
export class ShopifyIntegrationResolver {
  constructor(
    private readonly shopifyIntegrationService: ShopifyIntegrationService
  ) {}

  @Mutation(() => ShopifyStore, { 
    name: 'connectShopifyStore',
    description: 'Connect a Shopify store to the platform by providing shop domain and access token'
  })
  async connectShopifyStore(
    @Args('connectStoreInput') connectStoreInput: ConnectStoreInput
  ): Promise<ShopifyStore> {
    return this.shopifyIntegrationService.connectStore(connectStoreInput);
  }

  @Query(() => [ShopifyStore], { 
    name: 'shopifyStores',
    description: 'Get all connected Shopify stores'
  })
  getShopifyStores(): Promise<ShopifyStore[]> {
    return this.shopifyIntegrationService.getStores();
  }

  @Query(() => ShopifyStore, {
    name: 'shopifyStore',
    description: 'Get a Shopify store by ID'
  })
  getShopifyStore(
    @Args('id', { description: 'ID of the Shopify store' }) id: string
  ): Promise<ShopifyStore> {
    return this.shopifyIntegrationService.getStoreById(id);
  }

  @Mutation(() => ShopifyStore, {
    name: 'disconnectShopifyStore',
    description: 'Disconnect a Shopify store from the platform'
  })
  disconnectShopifyStore(
    @Args('id', { description: 'ID of the Shopify store to disconnect' }) id: string
  ): Promise<ShopifyStore> {
    return this.shopifyIntegrationService.disconnectStore(id);
  }

  @Mutation(() => [String], { 
    name: 'syncShopifyOrders',
    description: 'Sync orders from the specified Shopify store'
  })
  async syncShopifyOrders(
    @Args('storeId', { description: 'ID of the Shopify store' }) storeId: string
  ): Promise<string[]> {
    const orders = await this.shopifyIntegrationService.syncOrders(storeId);
    // Return order IDs for simplicity
    return orders.map(order => order.id);
  }

  @Query(() => [Object], {
    name: 'shopifyProducts',
    description: 'Get products from the specified Shopify store'
  })
  async getShopifyProducts(
    @Args('storeId', { description: 'ID of the Shopify store' }) storeId: string
  ): Promise<any[]> {
    return this.shopifyIntegrationService.getProducts(storeId);
  }
} 