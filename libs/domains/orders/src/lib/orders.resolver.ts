import { Resolver, Query, Mutation, Args, Int, Float } from '@nestjs/graphql';
import { OrdersService } from './orders.service';
import { Order, OrderStatus } from './order.model';
import { CreateOrderInput } from './create-order.input';
import { UpdateOrderInput } from './update-order.input';
import { OrdersFilterInput } from './orders-filter.input';

@Resolver(() => Order)
export class OrdersResolver {
  constructor(private ordersService: OrdersService) {}

  /**
   * Get all orders in the system
   * @returns Array of order objects
   */
  @Query(() => [Order], {
    name: 'orders',
    description: 'Get all orders ordered by creation date (newest first)',
  })
  async getOrders(): Promise<Order[]> {
    const orders = await this.ordersService.getOrders();
    return orders.map((o: any) => this.mapOrder(o));
  }

  /**
   * Get a specific order by ID
   * @param id - The ID of the order to retrieve
   * @returns Order object
   */
  @Query(() => Order, {
    name: 'order',
    description: 'Get a specific order by ID',
  })
  async getOrder(
    @Args('id', { type: () => Int, description: 'The ID of the order' })
    id: number,
  ): Promise<Order> {
    const order = await this.ordersService.getOrder(id);
    return this.mapOrder(order);
  }

  /**
   * Create a new order
   * @param createOrderInput - The order data to create
   * @returns The newly created order
   */
  @Mutation(() => Order, {
    description: 'Create a new order',
  })
  async createOrder(
    @Args('createOrderInput', { description: 'Order creation data' })
    createOrderInput: CreateOrderInput,
  ): Promise<Order> {
    const order = await this.ordersService.createOrder(createOrderInput);
    return this.mapOrder(order);
  }

  /**
   * Update an existing order
   * @param updateOrderInput - The order data to update
   * @returns The updated order
   */
  @Mutation(() => Order, {
    description: 'Update an existing order',
  })
  async updateOrder(
    @Args('updateOrderInput', { description: 'Order update data' })
    updateOrderInput: UpdateOrderInput,
  ): Promise<Order> {
    const order = await this.ordersService.updateOrder(updateOrderInput);
    return this.mapOrder(order);
  }

  /**
   * Delete an order by ID
   * @param id - The ID of the order to delete
   * @returns The deleted order
   */
  @Mutation(() => Order, {
    description:
      'Delete an order (only allowed for orders without shipments or returns and not in PAID status)',
  })
  async deleteOrder(
    @Args('id', {
      type: () => Int,
      description: 'The ID of the order to delete',
    })
    id: number,
  ): Promise<Order> {
    const order = await this.ordersService.deleteOrder(id);
    return this.mapOrder(order);
  }

  /**
   * Filter orders based on specific criteria
   * @param filter - The filter criteria
   * @returns Array of orders matching the criteria
   */
  @Query(() => [Order], {
    name: 'filterOrders',
    description:
      'Filter orders based on status, user ID, carrier ID, or order number',
  })
  async filterOrders(
    @Args('ordersFilterInput', { description: 'Filter criteria for orders' })
    filter: OrdersFilterInput,
  ): Promise<Order[]> {
    const orders = await this.ordersService.filterOrders(filter);
    return orders.map((o: any) => this.mapOrder(o));
  }

  /**
   * Get orders by user ID
   * @param userId - The user ID to filter by
   * @returns Array of orders for the specified user
   */
  @Query(() => [Order], {
    name: 'ordersByUser',
    description: 'Get orders by user ID',
  })
  async getOrdersByUser(
    @Args('userId', {
      type: () => Int,
      description: 'The user ID to filter by',
    })
    userId: number,
  ): Promise<Order[]> {
    const orders = await this.ordersService.getOrdersByUser(userId);
    return orders.map((o: any) => this.mapOrder(o));
  }

  /**
   * Get orders by status
   * @param status - The status to filter by
   * @returns Array of orders with the specified status
   */
  @Query(() => [Order], {
    name: 'ordersByStatus',
    description: 'Get orders by status',
  })
  async getOrdersByStatus(
    @Args('status', {
      type: () => OrderStatus,
      description: 'The status to filter by',
    })
    status: OrderStatus,
  ): Promise<Order[]> {
    const orders = await this.ordersService.getOrdersByStatus(status);
    return orders.map((o: any) => this.mapOrder(o));
  }

  /**
   * Get counts of orders by status
   * @returns Record with counts for each status
   */
  @Query(() => String, {
    name: 'orderCountsByStatus',
    description: 'Get counts of orders by status',
  })
  async getOrderCountsByStatus(): Promise<string> {
    const counts = await this.ordersService.countOrdersByStatus();
    return JSON.stringify(counts);
  }

  /**
   * Get total sales amount from paid orders
   * @returns Total sales amount
   */
  @Query(() => Float, {
    name: 'totalSales',
    description: 'Get total sales amount from paid orders',
  })
  async getTotalSales(): Promise<number> {
    return this.ordersService.getTotalSales();
  }

  /**
   * Map a Prisma order entity to GraphQL Order type
   */
  private mapOrder(order: any): Order {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      userId: order.userId,
      carrierId: order.carrierId ?? null,
      warehouseId: order.warehouseId ?? null,
      warehouse: order.warehouse ?? null,
      destinationName: order.destinationName ?? null,
      destinationPhone: order.destinationPhone ?? null,
      destinationAddressLine1: order.destinationAddressLine1 ?? null,
      destinationAddressLine2: order.destinationAddressLine2 ?? null,
      destinationCity: order.destinationCity ?? null,
      destinationState: order.destinationState ?? null,
      destinationPincode: order.destinationPincode ?? null,
      destinationCountry: order.destinationCountry ?? null,
      packageWeightGrams: order.packageWeightGrams ?? null,
      packageLengthCm: order.packageLengthCm ?? null,
      packageWidthCm: order.packageWidthCm ?? null,
      packageHeightCm: order.packageHeightCm ?? null,
    };
  }
}
