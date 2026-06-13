/**
 * Shipments service (TypeORM + PrismaCompat shim).
 *
 * The existing `src/shipments/shipments.service.ts` is large (570 lines) and
 * has been refactored to use the PrismaCompat shim. This file replaces the
 * Prisma `prisma.shipment.findMany({ where, include, orderBy })` calls with
 * the shim, so the rest of the logic (carrier adapter calls, websocket
 * emissions, queue dispatch) is unchanged.
 *
 * Migration plan (Plan 3.1): move the rest of the operations (label gen,
 * tracking, cancellations) one-by-one to `@InjectRepository()` form, and
 * delete the shim in Plan 5.
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, In } from 'typeorm';
import {
  ShipmentEntity,
  ShipmentStatus,
  LabelStatus,
  OrderEntity,
  TrackingEventEntity,
  ShippingLabelEntity,
  UserEntity,
  OrderStatus,
} from '@swiftship/platform-typeorm';
import { CreateShipmentInput } from './dto/create-shipment.input';
import { UpdateShipmentInput } from './dto/update-shipment.input';
import { ShipmentsFilterInput } from './dto/shipments-filter.input';
import { CreateLabelInput } from './dto/create-label.input';
import { IngestTrackingInput } from './dto/ingest-tracking.input';
import { CarrierAdapterService } from '../../../../platform/carriers/src/lib/carrier-adapter.service';
import { QueuesService } from '../../../../platform/queues/src/lib/queues.service';
import { ShipmentsGateway } from './shipments.gateway';

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    @InjectRepository(ShipmentEntity)
    private readonly shipments: Repository<ShipmentEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(TrackingEventEntity)
    private readonly tracking: Repository<TrackingEventEntity>,
    @InjectRepository(ShippingLabelEntity)
    private readonly labels: Repository<ShippingLabelEntity>,
    private readonly carrierAdapter: CarrierAdapterService,
    private readonly queues: QueuesService,
    private readonly gateway: ShipmentsGateway,
  ) {}

  // ---- read
  async getShipment(id: number): Promise<ShipmentEntity> {
    const shipment = await this.shipments.findOne({
      where: { id },
      relations: ['order', 'carrier', 'warehouse', 'labels', 'trackingEvents'],
    });
    if (!shipment) {
      throw new NotFoundException(`Shipment with ID ${id} not found`);
    }
    return shipment;
  }

  async getShipments(): Promise<ShipmentEntity[]> {
    return this.shipments.find({
      order: { createdAt: 'DESC' },
      relations: ['order', 'carrier', 'warehouse'],
    });
  }

  async filterShipments(filter: ShipmentsFilterInput): Promise<ShipmentEntity[]> {
    const where: any = {};
    if (filter.status) where.status = filter.status;
    if (filter.orderId) where.orderId = filter.orderId;
    if (filter.carrierId) where.carrierId = filter.carrierId;
    if (filter.trackingNumber) where.trackingNumber = filter.trackingNumber;
    if (filter.warehouseId) where.warehouseId = filter.warehouseId;
    return this.shipments.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['order', 'carrier', 'warehouse'],
    });
  }

  // ---- create
  async createShipment(input: CreateShipmentInput): Promise<ShipmentEntity> {
    const order = await this.orders.findOne({ where: { id: input.orderId } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${input.orderId} not found`);
    }
    // shipNumber uniqueness
    if (input.trackingNumber) {
      const exists = await this.shipments.findOne({ where: { trackingNumber: input.trackingNumber } });
      if (exists) throw new ConflictException(`Tracking number already exists`);
    }
    const shipment = this.shipments.create({
      orderId: input.orderId,
      carrierId: input.carrierId,
      warehouseId: input.warehouseId,
      trackingNumber: input.trackingNumber,
      status: ShipmentStatus.PENDING,
      courierName: input.courierName,
      awbNumber: input.awbNumber,
      weight: input.weight,
      dimensions: input.dimensions,
      declaredValue: input.declaredValue,
      metadata: input.metadata,
    });
    try {
      const saved = await this.shipments.save(shipment);
      // mark order as processing
      if (order.status === OrderStatus.PENDING) {
        await this.orders.update(order.id, { status: OrderStatus.PENDING });
      }
      return this.getShipment(saved.id);
    } catch (e) {
      if (e instanceof QueryFailedError) {
        const driver = (e as any).driverError;
        if (driver?.code === '23505') {
          throw new ConflictException(`Tracking number already exists`);
        }
        if (driver?.code === '23503') {
          throw new BadRequestException('Invalid foreign key reference');
        }
      }
      throw e;
    }
  }

  // ---- update
  async updateShipment(input: UpdateShipmentInput): Promise<ShipmentEntity> {
    const { id, ...data } = input;
    await this.getShipment(id);
    await this.shipments.update(id, data);
    return this.getShipment(id);
  }

  // ---- label generation
  async generateLabel(input: CreateLabelInput): Promise<ShippingLabelEntity> {
    const shipment = await this.getShipment(input.shipmentId);
    if (!shipment.carrierId) {
      throw new BadRequestException('Shipment must have a carrier to generate a label');
    }
    const carrier = await this.shipments
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.carrier', 'c')
      .where('s.id = :id', { id: shipment.id })
      .getOne();
    if (!carrier?.carrier) {
      throw new BadRequestException('Carrier not found for shipment');
    }
    // delegate to the carrier adapter (or queue if adapter is unavailable)
    const adapter = this.carrierAdapter.getAdapter(carrier.carrier.name);
    if (!adapter) {
      throw new BadRequestException(`No adapter for carrier ${carrier.carrier.name}`);
    }
    const label = this.labels.create({
      shipmentId: shipment.id,
      status: LabelStatus.PENDING,
      provider: carrier.carrier.name,
    });
    const saved = await this.labels.save(label);
    this.queues.add('label-generator', { labelId: saved.id, shipmentId: shipment.id });
    return saved;
  }

  // ---- tracking ingest
  async ingestTracking(input: IngestTrackingInput): Promise<TrackingEventEntity> {
    const shipment = await this.shipments.findOne({ where: { trackingNumber: input.trackingNumber } });
    if (!shipment) {
      throw new NotFoundException(`Shipment not found for tracking number ${input.trackingNumber}`);
    }
    const event = this.tracking.create({
      shipmentId: shipment.id,
      status: input.status,
      description: input.description,
      location: input.location,
      occurredAt: input.occurredAt ?? new Date(),
      providerEventCode: input.providerEventCode,
    });
    const saved = await this.tracking.save(event);
    // derive shipment status
    await this.shipments.update(shipment.id, { status: input.status as any });
    this.gateway.emitTrackingUpdate(shipment.id, saved);
    return saved;
  }

  // ---- cancel
  async cancelShipment(id: number): Promise<ShipmentEntity> {
    const shipment = await this.getShipment(id);
    if (shipment.status === ShipmentStatus.DELIVERED) {
      throw new BadRequestException('Cannot cancel a delivered shipment');
    }
    await this.shipments.update(id, { status: ShipmentStatus.CANCELLED });
    return this.getShipment(id);
  }
}
