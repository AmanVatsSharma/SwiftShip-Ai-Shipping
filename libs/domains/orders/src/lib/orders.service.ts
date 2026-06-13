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
import { CreateOrderInput } from './dto/create-order.input';
import { UpdateOrderInput } from './dto/update-order.input';
import { OrdersFilterInput } from './dto/orders-filter.input';

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
  ) {}

  // ---- read
  async getOrder(id: number): Promise<OrderEntity> {
    const order = await this.orders.findOne({
      where: { id },
      relations: ['shipments', 'returns', 'warehouse'],
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
    return order;
  }

  async getOrders(): Promise<OrderEntity[]> {
    return this.orders.find({
      order: { createdAt: 'DESC' },
      relations: ['shipments', 'returns', 'warehouse'],
    });
  }

  async filterOrders(filter: OrdersFilterInput): Promise<OrderEntity[]> {
    const where: any = {};
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
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);
    return this.orders.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['shipments', 'returns', 'warehouse'],
    });
  }

  async getOrdersByStatus(status: OrderStatus): Promise<OrderEntity[]> {
    return this.orders.find({
      where: { status },
      order: { createdAt: 'DESC' },
      relations: ['shipments', 'returns', 'warehouse'],
    });
  }

  // ---- create
  async createOrder(input: CreateOrderInput): Promise<OrderEntity> {
    // user
    const user = await this.users.findOne({ where: { id: input.userId } });
    if (!user) throw new BadRequestException(`User with ID ${input.userId} not found`);

    // carrier (optional)
    if (input.carrierId) {
      const carrier = await this.carriers.findOne({ where: { id: input.carrierId } });
      if (!carrier) throw new BadRequestException(`Carrier with ID ${input.carrierId} not found`);
    }

    if (!input.destinationPincode) throw new BadRequestException('Destination pincode is required');
    if (!input.packageWeightGrams) throw new BadRequestException('Package weight is required');

    const warehouseId = await this.resolveWarehouse(input.warehouseId, input.destinationPincode);

    const order = this.orders.create({
      orderNumber: input.orderNumber,
      total: input.total,
      userId: input.userId,
      carrierId: input.carrierId,
      warehouseId,
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
      const current = await this.orders.findOne({ where: { id } });
      if (current?.status === OrderStatus.CANCELLED && data.status !== OrderStatus.CANCELLED) {
        throw new BadRequestException('Cannot change status of a CANCELLED order');
      }
      if (current?.status === OrderStatus.REFUNDED && data.status !== OrderStatus.REFUNDED) {
        throw new BadRequestException('Cannot change status of a REFUNDED order');
      }
    }

    await this.orders.update(id, data);
    return this.getOrder(id);
  }

  // ---- delete
  async deleteOrder(id: number): Promise<OrderEntity> {
    const order = await this.getOrder(id);
    if ((await this.orders.findOne({ where: { id }, relations: ['shipments'] }))?.shipments?.length) {
      throw new BadRequestException('Cannot delete an order with associated shipments');
    }
    if ((await this.orders.findOne({ where: { id }, relations: ['returns'] }))?.returns?.length) {
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
}
