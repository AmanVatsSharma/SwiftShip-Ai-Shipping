/**
 * Shipments service.
 *
 * Tenant-scoped CRUD on `ShipmentEntity` plus label generation and tracking
 * ingestion. All persistence is via `@InjectRepository` (TypeORM) — see
 * MIGRATION.md §7 for the migration mapping from the legacy
 * `prisma.shipment.findMany(...)` call sites.
 *
 * `generateLabel` uses a `createQueryBuilder` to left-join the carrier in a
 * single round-trip so we avoid an N+1 when many shipments are processed in
 * batch (SS-043e — query-load test expects <=5 queries for 100 shipments).
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
import { TenantContext } from '@swiftship/domains-tenants';
import { CreateShipmentInput } from './dto/create-shipment.input';
import { UpdateShipmentInput } from './dto/update-shipment.input';
import { ShipmentsFilterInput } from './dto/shipments-filter.input';
import { CreateLabelInput } from './dto/create-label.input';
import { IngestTrackingInput } from './dto/ingest-tracking.input';
import { CarrierAdapterService } from '@swiftship/platform-carriers';
import { QueuesService } from '@swiftship/platform-queues';
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
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * SS-002c: every read/write of a tenant-scoped entity must include the
   * current `tenantId` in the `where` clause. The shim's safety net would
   * catch a missing filter, but adding it explicitly here keeps the
   * intent clear at the call site.
   */
  private requireTenantId(): number {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new BadRequestException('Tenant context required for shipment operation');
    }
    return Number(tid);
  }

  // ---- read
  async getShipment(id: number): Promise<ShipmentEntity> {
    const tenantId = this.requireTenantId();
    const shipment = await this.shipments.findOne({
      where: { id, tenantId },
      relations: ['order', 'carrier', 'warehouse', 'label', 'trackingEvents'],
    });
    if (!shipment) {
      throw new NotFoundException(`Shipment with ID ${id} not found`);
    }
    return shipment;
  }

  async getShipments(): Promise<ShipmentEntity[]> {
    const tenantId = this.requireTenantId();
    return this.shipments.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      relations: ['order', 'carrier', 'warehouse'],
    });
  }

  async filterShipments(filter: ShipmentsFilterInput): Promise<ShipmentEntity[]> {
    const tenantId = this.requireTenantId();
    const where: any = { tenantId };
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
    const tenantId = this.requireTenantId();
    const order = await this.orders.findOne({ where: { id: input.orderId, tenantId } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${input.orderId} not found`);
    }
    // shipNumber uniqueness (scoped to the tenant — tenant A's AWB must
    // not collide with tenant B's because AWBs are issued by the carrier
    // per merchant account, but we still scope to be safe).
    if (input.trackingNumber) {
      const exists = await this.shipments.findOne({
        where: { trackingNumber: input.trackingNumber, tenantId },
      });
      if (exists) throw new ConflictException(`Tracking number already exists`);
    }
    const shipment = this.shipments.create({
      orderId: input.orderId,
      carrierId: input.carrierId,
      warehouseId: input.warehouseId ?? null,
      trackingNumber: input.trackingNumber,
      tenantId,
      status: ShipmentStatus.PENDING,
      shippedAt: input.shippedAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
      weightGrams: input.weightGrams ?? null,
      lengthCm: input.lengthCm ?? null,
      widthCm: input.widthCm ?? null,
      heightCm: input.heightCm ?? null,
      originPincode: input.originPincode ?? null,
      destinationPincode: input.destinationPincode ?? null,
    });
    try {
      const saved = await this.shipments.save(shipment);
      // mark order as processing
      if (order.status === OrderStatus.PENDING) {
        await this.orders.update({ id: order.id, tenantId } as any, { status: OrderStatus.PENDING });
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
    const tenantId = this.requireTenantId();
    const { id, ...data } = input;
    await this.getShipment(id);
    delete (data as any).tenantId;
    await this.shipments.update({ id, tenantId } as any, data);
    return this.getShipment(id);
  }

  // ---- label generation
  async generateLabel(input: CreateLabelInput): Promise<ShippingLabelEntity> {
    const tenantId = this.requireTenantId();
    const shipment = await this.getShipment(input.shipmentId);
    if (!shipment.carrierId) {
      throw new BadRequestException('Shipment must have a carrier to generate a label');
    }
    const carrier = await this.shipments
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.carrier', 'c')
      .where('s.id = :id', { id: shipment.id })
      .andWhere('s.tenantId = :tenantId', { tenantId })
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
      carrierCode: carrier.carrier.name,
      status: LabelStatus.PENDING,
      // Placeholder until the label-generator worker mints the carrier's
      // real label number / URL.
      labelNumber: `PENDING-${shipment.id}-${Date.now()}`,
      requestedAt: new Date(),
    });
    const saved = await this.labels.save(label);
    this.queues.add('label-generator', { labelId: saved.id, shipmentId: shipment.id });
    return saved;
  }

  // ---- tracking ingest
  async ingestTracking(input: IngestTrackingInput): Promise<TrackingEventEntity> {
    const tenantId = this.requireTenantId();
    const shipment = await this.shipments.findOne({
      where: { trackingNumber: input.trackingNumber, tenantId },
    });
    if (!shipment) {
      throw new NotFoundException(`Shipment not found for tracking number ${input.trackingNumber}`);
    }
    const event = this.tracking.create({
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      status: input.status,
      subStatus: input.subStatus ?? null,
      description: input.description ?? null,
      eventCode: input.eventCode ?? null,
      location: input.location ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    });
    const saved = await this.tracking.save(event);
    // derive shipment status
    await this.shipments.update({ id: shipment.id, tenantId } as any, {
      status: input.status as any,
    });
    this.gateway.notifyTrackingEvent(saved);
    return saved;
  }

  // ---- cancel
  async cancelShipment(id: number): Promise<ShipmentEntity> {
    const tenantId = this.requireTenantId();
    const shipment = await this.getShipment(id);
    if (shipment.status === ShipmentStatus.DELIVERED) {
      throw new BadRequestException('Cannot cancel a delivered shipment');
    }
    await this.shipments.update(
      { id, tenantId } as any,
      { status: ShipmentStatus.CANCELLED },
    );
    return this.getShipment(id);
  }
}
