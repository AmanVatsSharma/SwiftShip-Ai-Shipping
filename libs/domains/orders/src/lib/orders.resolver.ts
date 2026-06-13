import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard, RolesGuard, Roles } from '@swiftship/platform-auth';
import { OrdersService } from './orders.service';
import { Order, OrderStatus } from './order.model';
import { CreateOrderInput } from './dto/create-order.input';
import { UpdateOrderInput } from './dto/update-order.input';
import { OrdersFilterInput } from './dto/orders-filter.input';

@Resolver(() => Order)
@UseGuards(GqlAuthGuard, RolesGuard)
export class OrdersResolver {
  constructor(private readonly service: OrdersService) {}

  @Query(() => [Order], {
    name: 'orders',
    description: 'Get all orders (newest first)',
  })
  @Roles('ADMIN', 'STAFF', 'SELLER')
  getOrders() {
    return this.service.getOrders();
  }

  @Query(() => Order, { name: 'order' })
  @Roles('ADMIN', 'STAFF', 'SELLER')
  one(@Args('id', { type: () => Int }) id: number) {
    return this.service.getOrder(id);
  }

  @Query(() => [Order], { name: 'ordersByUser' })
  @Roles('ADMIN', 'STAFF', 'SELLER')
  byUser(@Args('userId', { type: () => Int }) userId: number) {
    return this.service.getOrdersByUser(userId);
  }

  @Query(() => [Order], { name: 'ordersByStatus' })
  @Roles('ADMIN', 'STAFF', 'SELLER')
  byStatus(@Args('status', { type: () => OrderStatus }) status: OrderStatus) {
    return this.service.getOrdersByStatus(status);
  }

  @Query(() => [Order], { name: 'filterOrders' })
  @Roles('ADMIN', 'STAFF', 'SELLER')
  filter(@Args('filter') filter: OrdersFilterInput) {
    return this.service.filterOrders(filter);
  }

  @Query(() => String, { name: 'totalSales' })
  @Roles('ADMIN', 'STAFF')
  async totalSales(): Promise<number> {
    return this.service.getTotalSales();
  }

  @Mutation(() => Order)
  @Roles('ADMIN', 'STAFF', 'SELLER')
  createOrder(@Args('input') input: CreateOrderInput) {
    return this.service.createOrder(input);
  }

  @Mutation(() => Order)
  @Roles('ADMIN', 'STAFF')
  updateOrder(@Args('input') input: UpdateOrderInput) {
    return this.service.updateOrder(input);
  }

  @Mutation(() => Boolean)
  @Roles('ADMIN')
  async deleteOrder(@Args('id', { type: () => Int }) id: number) {
    await this.service.deleteOrder(id);
    return true;
  }
}
