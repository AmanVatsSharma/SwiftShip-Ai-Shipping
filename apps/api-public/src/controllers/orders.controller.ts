/**
 * SS-027 — tsoa OrdersController.
 *
 * Mirrors the GraphQL surface in `libs/domains/orders/src/lib/orders.resolver.ts`
 * via direct TypeORM access. Auth: `X-Swiftship-Api-Key`.
 *
 * Every method has an explicit `Promise<...Dto>` return type so tsoa
 * does NOT follow the inferred return type from the body expression
 * (which would point at the TypeORM entity class and trip the model
 * resolver).
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Path,
  Body,
  Query,
  Route,
  Security,
  Tags,
  SuccessResponse,
  Response,
} from 'tsoa';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { OrdersService } from '../../../../libs/domains/orders/src/lib/orders.service';
import { CreateOrderInput } from '../../../../libs/domains/orders/src/lib/dto/create-order.input';
import { UpdateOrderInput } from '../../../../libs/domains/orders/src/lib/dto/update-order.input';
import { OrdersFilterInput } from '../../../../libs/domains/orders/src/lib/dto/orders-filter.input';
import {
  CreateOrderRequestDto,
  FindOrdersRequestDto,
  FindOrdersResponse,
} from './order.model';
import { OrderStatus } from '@swiftship/platform-typeorm';

export interface OrderResponse {
  id: number;
  orderNumber: string;
  total: number;
  status: OrderStatus;
  userId: number;
  carrierId?: number;
  createdAt: Date;
  updatedAt: Date;
}

function toOrderResponse(o: any): OrderResponse {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    total: o.total,
    status: o.status,
    userId: o.userId,
    carrierId: o.carrierId ?? undefined,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

@Injectable()
@Route('v1/orders')
@Tags('Orders')
@Security('api_key')
export class OrdersController extends Controller {
  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  /**
   * List orders for the current tenant.
   */
  @Get()
  @SuccessResponse('200', 'OK')
  public async findOrders(
    @Query() query?: FindOrdersRequestDto,
  ): Promise<FindOrdersResponse> {
    const filter: OrdersFilterInput = {
      orderNumber: query?.orderNumber,
      status: query?.status as unknown as OrderStatus,
      userId: query?.userId,
    };
    let items = await this.ordersService.filterOrders(filter);
    if (query?.minCreatedAt) {
      const min = new Date(query.minCreatedAt);
      items = items.filter((o) => o.createdAt >= min);
    }
    if (query?.maxCreatedAt) {
      const max = new Date(query.maxCreatedAt);
      items = items.filter((o) => o.createdAt <= max);
    }
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? 25;
    const total = items.length;
    items = items.slice(offset, offset + limit);
    return {
      orders: items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        total: o.total,
        status: o.status,
        createdAt: o.createdAt,
        userId: o.userId,
        carrierId: o.carrierId ?? null,
      })),
      pagination: { total, offset, limit },
    };
  }

  /**
   * Total sales across all PAID orders (sum of `total`).
   * Mirrors the GraphQL `totalSales` query in `orders.resolver.ts`.
   */
  @Get('total-sales')
  @SuccessResponse('200', 'OK')
  public async totalSales(): Promise<{ total: number }> {
    const total = await this.ordersService.getTotalSales();
    return { total };
  }

  /**
   * Count of orders grouped by `status`. Mirrors the GraphQL
   * `orderCountsByStatus` query.
   */
  @Get('counts-by-status')
  @SuccessResponse('200', 'OK')
  public async countsByStatus(): Promise<Record<string, number>> {
    return this.ordersService.countOrdersByStatus();
  }

  /**
   * Get a single order by id.
   */
  @Get('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Order not found')
  public async findOrderById(@Path() id: number): Promise<OrderResponse> {
    const order = await this.ordersService.getOrder(id);
    if (!order) throw new NotFoundException('Order not found');
    return toOrderResponse(order);
  }

  /**
   * Create a new order.
   */
  @Post()
  @SuccessResponse('201', 'Created')
  @Response<BadRequestException>(400, 'Invalid input')
  public async createOrder(@Body() body: CreateOrderRequestDto): Promise<OrderResponse> {
    const input: CreateOrderInput = {
      orderNumber: body.orderNumber,
      total: body.total,
      userId: body.userId,
      status: body.status as unknown as OrderStatus,
      carrierId: body.carrierId,
      destinationPincode: body.destinationPincode ?? '000000',
      packageWeightGrams: body.packageWeightGrams ?? 500,
    };
    const created = await this.ordersService.createOrder(input);
    return toOrderResponse(created);
  }

  /**
   * Update an order by id.
   */
  @Patch('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Order not found')
  public async updateOrder(
    @Path() id: number,
    @Body() body: CreateOrderRequestDto,
  ): Promise<OrderResponse> {
    const input: UpdateOrderInput = { id, ...body } as UpdateOrderInput;
    const updated = await this.ordersService.updateOrder(input);
    return toOrderResponse(updated);
  }

  /**
   * Delete an order by id.
   */
  @Delete('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Order not found')
  public async deleteOrder(@Path() id: number): Promise<{ id: number; ok: true }> {
    await this.ordersService.deleteOrder(id);
    return { id, ok: true };
  }
}
