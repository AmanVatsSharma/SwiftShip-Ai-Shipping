import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { ShopifyOrder } from '../models/shopify-order.model';
import { ShopifyOrdersService } from '../services/shopify-orders.service';
import { CreateShopifyOrderInput, ShopifyOrderStatus } from '../dto/create-shopify-order.input';

@Resolver(() => ShopifyOrder)
export class ShopifyOrdersResolver {
  constructor(
    private readonly shopifyOrdersService: ShopifyOrdersService
  ) {}

  @Query(() => [ShopifyOrder], {
    name: 'shopifyOrders',
    description: 'Get all Shopify orders'
  })
  getShopifyOrders(): Promise<ShopifyOrder[]> {
    return this.shopifyOrdersService.getShopifyOrders();
  }

  @Query(() => [ShopifyOrder], {
    name: 'shopifyOrdersByStore',
    description: 'Get all Shopify orders for a specific store'
  })
  getShopifyOrdersByStore(
    @Args('storeId', { description: 'ID of the Shopify store' }) storeId: string
  ): Promise<ShopifyOrder[]> {
    return this.shopifyOrdersService.getOrdersByStore(storeId);
  }

  @Query(() => ShopifyOrder, {
    name: 'shopifyOrder',
    description: 'Get a specific Shopify order by ID'
  })
  getShopifyOrder(
    @Args('id', { description: 'ID of the Shopify order' }) id: string
  ): Promise<ShopifyOrder> {
    return this.shopifyOrdersService.getOrderById(id);
  }

  @Mutation(() => ShopifyOrder, {
    name: 'createShopifyOrder',
    description: 'Create a new Shopify order'
  })
  createShopifyOrder(
    @Args('createOrderInput') createOrderInput: CreateShopifyOrderInput
  ): Promise<ShopifyOrder> {
    return this.shopifyOrdersService.createOrder(createOrderInput);
  }

  @Mutation(() => ShopifyOrder, {
    name: 'updateShopifyOrderStatus',
    description: 'Update the status of a Shopify order'
  })
  updateShopifyOrderStatus(
    @Args('id', { description: 'ID of the Shopify order' }) id: string,
    @Args('status', { description: 'New status for the order' }) status: ShopifyOrderStatus
  ): Promise<ShopifyOrder> {
    return this.shopifyOrdersService.updateOrderStatus(id, status);
  }

  @Mutation(() => ShopifyOrder, {
    name: 'deleteShopifyOrder',
    description: 'Delete a Shopify order'
  })
  deleteShopifyOrder(
    @Args('id', { description: 'ID of the Shopify order to delete' }) id: string
  ): Promise<ShopifyOrder> {
    return this.shopifyOrdersService.deleteOrder(id);
  }
} 