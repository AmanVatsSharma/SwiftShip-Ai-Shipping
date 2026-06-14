import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, QueryFailedError } from 'typeorm';
import {
  OrderEntity,
  OrderStatus,
  UserEntity,
  CarrierEntity,
  WarehouseEntity,
  WarehouseCoverageEntity,
  ShipmentEntity,
  ReturnEntity,
  PaymentStatus,
} from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import {
  RateRankingService,
  RateRankingStrategy,
  type RateRankingStrategyName,
  type RateRankingPreferences,
  type RankedRateQuote,
} from '@swiftship/domains-rate-shop';
import { CreateOrderInput } from './dto/create-order.input';
import { UpdateOrderInput } from './dto/update-order.input';
import { OrdersFilterInput } from './dto/orders-filter.input';
import { OrderRateQuoteService } from './order-rate-quote.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(CarrierEntity)
    private readonly carriers: Repository<CarrierEntity>,
    @InjectRepository(WarehouseEntity)
    private readonly warehouses: Repository<WarehouseEntity>,
    @InjectRepository(WarehouseCoverageEntity)
    private readonly coverage: Repository<WarehouseCoverageEntity>,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContext,
    private readonly rateRanking: RateRankingService,
    private readonly orderRateQuoteService: OrderRateQuoteService,
  ) {}

  /**
   * SS-002c: every read/write of a tenant-scoped entity must include the
   * current `tenantId` in the `where` clause. We centralise the guard so
   * the rest of the service doesn't have to remember.
   */
  private requireTenantId(): number {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new BadRequestException('Tenant context required for order operation');
    }
    return Number(tid);
  }

  // ---- read
  async getOrder(id: number): Promise<OrderEntity> {
    const tenantId = this.requireTenantId();
    const order = await this.orders.findOne({
      where: { id, tenantId },
      relations: ['shipments', 'returns', 'warehouse'],
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
    return order;
  }

  async getOrders(): Promise<OrderEntity[]> {
    const tenantId = this.requireTenantId();
    return this.orders.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      relations: ['shipments', 'returns', 'warehouse'],
    });
  }

  async filterOrders(filter: OrdersFilterInput): Promise<OrderEntity[]> {
    const tenantId = this.requireTenantId();
    const where: any = { tenantId };
    if (filter.status) where.status = filter.status;
    if (filter.userId) where.userId = filter.userId;
    if (filter.carrierId) where.carrierId = filter.carrierId;
    if (filter.orderNumber) where.orderNumber = filter.orderNumber;
    if (filter.warehouseId) where.warehouseId = filter.warehouseId;
    return this.orders.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['shipments', 'returns', 'warehouse'],
    });
  }

  async getOrdersByUser(userId: number): Promise<OrderEntity[]> {
    const tenantId = this.requireTenantId();
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);
    return this.orders.find({
      where: { userId, tenantId },
      order: { createdAt: 'DESC' },
      relations: ['shipments', 'returns', 'warehouse'],
    });
  }

  async getOrdersByStatus(status: OrderStatus): Promise<OrderEntity[]> {
    const tenantId = this.requireTenantId();
    return this.orders.find({
      where: { status, tenantId },
      order: { createdAt: 'DESC' },
      relations: ['shipments', 'returns', 'warehouse'],
    });
  }

  // ---- create
  async createOrder(input: CreateOrderInput): Promise<OrderEntity> {
    const tenantId = this.requireTenantId();
    // user
    const user = await this.users.findOne({ where: { id: input.userId } });
    if (!user) throw new BadRequestException(`User with ID ${input.userId} not found`);

    if (!input.destinationPincode) throw new BadRequestException('Destination pincode is required');
    if (!input.packageWeightGrams) throw new BadRequestException('Package weight is required');

    const warehouseId = await this.resolveWarehouse(input.warehouseId, input.destinationPincode);

    // ---- SS-015: rate-engine auto-pick --------------------------------
    // If `rankRate` is true (default), call `RateRankingService.rank(...)`
    // and let the engine pick the winner. If false, the merchant-supplied
    // `carrierId` is used as today.
    let resolvedCarrierId = input.carrierId;
    let rankedQuotes: RankedRateQuote[] = [];
    if (input.rankRate !== false) {
      const originPincode = await this.resolveOriginPincode(
        warehouseId,
        tenantId,
      );
      const strategyName = (input.rateStrategy ??
        RateRankingStrategy.BEST_VALUE) as RateRankingStrategyName;
      const prefs: RateRankingPreferences = {
        strategy: strategyName,
        // COD declared value (paise) — uses the order total as a proxy.
        // Real COD orders will be tagged later by the billing lib.
        codAmountPaise: Math.round((input.total ?? 0) * 100),
      };

      try {
        rankedQuotes = await this.rateRanking.rank(
          {
            originPincode,
            destinationPincode: input.destinationPincode!,
            weightGrams: input.packageWeightGrams!,
            paymentMethod: 'PREPAID',
          },
          prefs,
        );
      } catch (e) {
        // Rate-engine failure is a hard error — we do NOT silently fall
        // back to a default carrier. The merchant must explicitly opt out
        // (rankRate=false) or fix the rate-engine.
        throw new BadRequestException(
          `Rate-engine auto-pick failed: ${(e as Error).message ?? 'unknown error'}`,
        );
      }

      if (rankedQuotes.length === 0) {
        throw new BadRequestException(
          'No carriers available for this shipment — try rankRate=false to pick a carrier manually',
        );
      }

      const winner = rankedQuotes[0];
      const carrierId = await this.resolveCarrierId(
        winner.carrierCode,
        tenantId,
      );
      if (!carrierId) {
        throw new BadRequestException(
          `Winning carrier ${winner.carrierCode} is not connected for this tenant`,
        );
      }
      resolvedCarrierId = carrierId;
    } else {
      // rankRate=false: validate the merchant-supplied carrierId as today.
      if (input.carrierId) {
        const carrier = await this.carriers.findOne({
          where: { id: input.carrierId },
        });
        if (!carrier) {
          throw new BadRequestException(
            `Carrier with ID ${input.carrierId} not found`,
          );
        }
      }
    }
    // ---- /SS-015 -----------------------------------------------------

    const order = this.orders.create({
      orderNumber: input.orderNumber,
      total: input.total,
      userId: input.userId,
      carrierId: resolvedCarrierId,
      warehouseId,
      tenantId,
      status: input.status ?? OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      destinationName: input.destinationName,
      destinationPhone: input.destinationPhone,
      destinationAddressLine1: input.destinationAddressLine1,
      destinationAddressLine2: input.destinationAddressLine2,
      destinationCity: input.destinationCity,
      destinationState: input.destinationState,
      destinationPincode: input.destinationPincode,
      destinationCountry: input.destinationCountry,
      packageWeightGrams: input.packageWeightGrams,
      packageLengthCm: input.packageLengthCm,
      packageWidthCm: input.packageWidthCm,
      packageHeightCm: input.packageHeightCm,
    });
    try {
      const saved = await this.orders.save(order);

      // Persist the ranked-quote audit trail. Done after the order save
      // so we have a stable `orderId` and a failed save doesn't leak
      // orphan rows.
      if (rankedQuotes.length > 0) {
        await this.orderRateQuoteService.recordRankedQuotes(
          saved.id,
          rankedQuotes,
        );
      }

      return this.getOrder(saved.id);
    } catch (e) {
      if (e instanceof QueryFailedError) {
        const driver = (e as any).driverError;
        if (driver?.code === '23505') {
          throw new ConflictException(`Order with number ${input.orderNumber} already exists`);
        }
        if (driver?.code === '23503') {
          throw new BadRequestException('Invalid foreign key reference');
        }
      }
      throw e;
    }
  }

  // ---- update
  async updateOrder(input: UpdateOrderInput): Promise<OrderEntity> {
    const tenantId = this.requireTenantId();
    const { id, ...data } = input;
    await this.getOrder(id);

    if (data.carrierId) {
      const carrier = await this.carriers.findOne({ where: { id: data.carrierId } });
      if (!carrier) throw new BadRequestException(`Carrier with ID ${data.carrierId} not found`);
    }
    if (data.warehouseId) {
      const wh = await this.warehouses.findOne({ where: { id: data.warehouseId } });
      if (!wh || !wh.isActive) {
        throw new BadRequestException(`Warehouse with ID ${data.warehouseId} not found or inactive`);
      }
    }

    if (data.status) {
      const current = await this.orders.findOne({ where: { id, tenantId } });
      if (current?.status === OrderStatus.CANCELLED && data.status !== OrderStatus.CANCELLED) {
        throw new BadRequestException('Cannot change status of a CANCELLED order');
      }
      if (current?.status === OrderStatus.REFUNDED && data.status !== OrderStatus.REFUNDED) {
        throw new BadRequestException('Cannot change status of a REFUNDED order');
      }
    }

    // Refuse to write a tenantId from the payload — it's request-scoped.
    delete (data as any).tenantId;
    await this.orders.update({ id, tenantId } as any, data);
    return this.getOrder(id);
  }

  // ---- delete
  async deleteOrder(id: number): Promise<OrderEntity> {
    const tenantId = this.requireTenantId();
    const order = await this.getOrder(id);
    if (
      (await this.orders.findOne({ where: { id, tenantId }, relations: ['shipments'] }))?.shipments
        ?.length
    ) {
      throw new BadRequestException('Cannot delete an order with associated shipments');
    }
    if (
      (await this.orders.findOne({ where: { id, tenantId }, relations: ['returns'] }))?.returns
        ?.length
    ) {
      throw new BadRequestException('Cannot delete an order with associated returns');
    }
    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException('Cannot delete a PAID order');
    }
    return this.dataSource.transaction(async (em) => {
      await em.remove(order);
      return order;
    });
  }

  // ---- analytics
  async countOrdersByStatus(): Promise<Record<OrderStatus, number>> {
    const result: Record<OrderStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      PAID: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
      REFUNDED: 0,
      RTO: 0,
      LOST: 0,
      EXCEPTION: 0,
    } as any;
    const rows = await this.orders
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.status')
      .getRawMany<{ status: OrderStatus; count: string }>();
    for (const r of rows) {
      result[r.status] = Number(r.count);
    }
    return result;
  }

  async getTotalSales(): Promise<number> {
    const row = await this.orders
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.total), 0)', 'total')
      .where('o.status = :s', { s: OrderStatus.PAID })
      .getRawOne<{ total: string | null }>();
    return Number(row?.total ?? 0);
  }

  // ---- helpers
  private async resolveWarehouse(
    requestedWarehouseId?: number,
    destinationPincode?: string,
  ): Promise<number> {
    if (!destinationPincode && !requestedWarehouseId) {
      throw new BadRequestException('Destination pincode is required to allocate a warehouse');
    }
    if (requestedWarehouseId) {
      const wh = await this.warehouses.findOne({ where: { id: requestedWarehouseId } });
      if (!wh || !wh.isActive) {
        throw new BadRequestException(`Warehouse with ID ${requestedWarehouseId} not found or inactive`);
      }
      return requestedWarehouseId;
    }
    if (destinationPincode) {
      const coverage = await this.coverage.findOne({
        where: { pincode: destinationPincode },
        order: { tatDays: 'ASC' },
      });
      if (coverage) return coverage.warehouseId;
    }
    const fallback = await this.warehouses.findOne({
      where: { isActive: true },
      order: { createdAt: 'ASC' },
      select: { id: true },
    });
    if (!fallback) throw new BadRequestException('No active warehouses configured');
    return fallback.id;
  }

  /**
   * SS-015: origin pincode for the rate-engine request. Comes from the
   * warehouse that the order will ship from. Falls back to a sentinel
   * so the rate-engine can still produce a quote (the warehouse lookup
   * itself would have thrown if there were no active warehouses).
   */
  private async resolveOriginPincode(
    warehouseId: number,
    tenantId: number,
  ): Promise<string> {
    const wh = await this.warehouses.findOne({
      where: { id: warehouseId, tenantId },
    });
    if (wh?.pincode) return wh.pincode;
    // Last-resort fallback — rate-engine would still need *some* string.
    // 110001 is Delhi's CP pincode (a common default in shipping APIs).
    return '110001';
  }

  /**
   * SS-015: map the ranker's `carrierCode` (e.g. 'DELHIVERY') to the
   * tenant-scoped `CarrierEntity.id`. Returns null when no row matches.
   */
  private async resolveCarrierId(
    carrierCode: string,
    tenantId: number,
  ): Promise<number | null> {
    const carrier = await this.carriers.findOne({
      where: { name: carrierCode, tenantId },
    });
    return carrier?.id ?? null;
  }
}
