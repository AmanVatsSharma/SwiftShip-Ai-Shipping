import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard, CurrentUser } from '@swiftship/platform-auth';
import { WooCommerceIntegrationService } from './services/woocommerce-integration.service';
import { WooCommerceOrdersService } from './services/woocommerce-orders.service';

/**
 * JWT payload attached by the GqlAuthGuard (req.user). Only the id is
 * consumed here.
 */
interface AuthUser {
  id: number;
}

/**
 * WooCommerce Resolver
 *
 * GraphQL resolver for WooCommerce integration.
 */
@Resolver()
export class WooCommerceResolver {
  constructor(
    private readonly integrationService: WooCommerceIntegrationService,
    private readonly ordersService: WooCommerceOrdersService,
  ) {}

  @Mutation(() => String, { description: 'Connect a WooCommerce store' })
  @UseGuards(GqlAuthGuard)
  async connectWooCommerceStore(
    @Args('storeUrl') storeUrl: string,
    @Args('consumerKey') consumerKey: string,
    @Args('consumerSecret') consumerSecret: string,
    @CurrentUser() user: AuthUser,
  ): Promise<string> {
    const store = await this.integrationService.connectStore(
      user.id,
      storeUrl,
      consumerKey,
      consumerSecret,
    );
    return store.id;
  }

  @Query(() => [Object], { description: 'Get all WooCommerce stores' })
  @UseGuards(GqlAuthGuard)
  async woocommerceStores(@CurrentUser() user: AuthUser) {
    return this.integrationService.getStoresByUser(user.id);
  }

  @Mutation(() => Boolean, { description: 'Disconnect a WooCommerce store' })
  @UseGuards(GqlAuthGuard)
  async disconnectWooCommerceStore(
    @Args('storeId') storeId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<boolean> {
    await this.integrationService.disconnectStore(storeId, user.id);
    return true;
  }

  @Mutation(() => Object, { description: 'Sync orders from WooCommerce store' })
  @UseGuards(GqlAuthGuard)
  async syncWooCommerceOrders(
    @Args('storeId') storeId: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 100 })
    limit: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.syncOrders(storeId, user.id, limit);
  }

  @Query(() => [Object], { description: 'Get orders from WooCommerce store' })
  @UseGuards(GqlAuthGuard)
  async woocommerceOrders(
    @Args('storeId') storeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.getOrdersByStore(storeId, user.id);
  }
}
