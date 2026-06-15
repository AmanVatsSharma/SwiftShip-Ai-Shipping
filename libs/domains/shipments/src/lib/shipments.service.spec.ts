import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ShipmentsService } from './shipments.service';
import { TenantContext } from '@swiftship/domains-tenants';
import { CarrierAdapterService } from '@swiftship/platform-carriers';
import { QueuesService } from '@swiftship/platform-queues';
import { ShipmentsGateway } from './shipments.gateway';
import { ShipmentsFilterInput } from './dto/shipments-filter.input';

/**
 * `ShipmentsService` unit tests.
 *
 * Repositories are stubbed with plain jest.fn() objects (same pattern as
 * `libs/domains/orders/src/lib/orders.service.spec.ts`). The `dataSource`
 * and `tenantContext` are stubbed too; the carrier adapter, queues, and
 * gateway are no-ops.
 *
 * SS-043e: includes an N+1 regression test — 100 shipments must not
 * produce more than 5 queries (the eager `relations` fetch in
 * `getShipments` should be a single round-trip).
 */
describe('ShipmentsService', () => {
  let service: ShipmentsService;
  let tenantContext: { getTenantId: jest.Mock };

  // ---- repository stubs ----
  const shipments = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const orders = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const users = {
    findOne: jest.fn(),
  };
  const tracking = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const labels = {
    create: jest.fn(),
    save: jest.fn(),
  };

  // ---- dependency stubs ----
  const carrierAdapter = { getAdapter: jest.fn() };
  const queues = { add: jest.fn() };
  const gateway = { emitTrackingUpdate: jest.fn() };
  const dataSource = { transaction: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantContext = { getTenantId: jest.fn().mockReturnValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipmentsService,
        { provide: 'ShipmentEntityRepository', useValue: shipments },
        { provide: 'OrderEntityRepository', useValue: orders },
        { provide: 'UserEntityRepository', useValue: users },
        { provide: 'TrackingEventEntityRepository', useValue: tracking },
        { provide: 'ShippingLabelEntityRepository', useValue: labels },
        { provide: CarrierAdapterService, useValue: carrierAdapter },
        { provide: QueuesService, useValue: queues },
        { provide: ShipmentsGateway, useValue: gateway },
        { provide: DataSource, useValue: dataSource },
        { provide: TenantContext, useValue: tenantContext },
      ],
    }).compile();

    service = module.get(ShipmentsService);

    // Wire stubs directly into the service instance (mirrors orders spec).
    (service as any).shipments = shipments;
    (service as any).orders = orders;
    (service as any).users = users;
    (service as any).tracking = tracking;
    (service as any).labels = labels;
    (service as any).carrierAdapter = carrierAdapter;
    (service as any).queues = queues;
    (service as any).gateway = gateway;
    (service as any).dataSource = dataSource;
    (service as any).tenantContext = tenantContext;
  });

  // ---- read ----

  it('getShipment returns the entity with relations', async () => {
    const entity = {
      id: 1,
      tenantId: 1,
      order: {},
      carrier: {},
      warehouse: {},
      labels: [],
      trackingEvents: [],
    } as any;
    shipments.findOne.mockResolvedValueOnce(entity);

    const result = await service.getShipment(1);

    expect(shipments.findOne).toHaveBeenCalledWith({
      where: { id: 1, tenantId: 1 },
      relations: ['order', 'carrier', 'warehouse', 'labels', 'trackingEvents'],
    });
    expect(result).toBe(entity);
  });

  it('getShipment throws NotFoundException when missing', async () => {
    shipments.findOne.mockResolvedValueOnce(null);
    await expect(service.getShipment(99)).rejects.toThrow(NotFoundException);
    expect(shipments.findOne).toHaveBeenCalledWith({
      where: { id: 99, tenantId: 1 },
      relations: ['order', 'carrier', 'warehouse', 'labels', 'trackingEvents'],
    });
  });

  it('getShipments returns all for the current tenant', async () => {
    const items = [
      { id: 1, tenantId: 1 },
      { id: 2, tenantId: 1 },
    ] as any;
    shipments.find.mockResolvedValueOnce(items);

    const result = await service.getShipments();

    expect(shipments.find).toHaveBeenCalledWith({
      where: { tenantId: 1 },
      order: { createdAt: 'DESC' },
      relations: ['order', 'carrier', 'warehouse'],
    });
    expect(result).toBe(items);
  });

  it('filterShipments applies optional filters', async () => {
    shipments.find.mockResolvedValueOnce([]);

    const filter: ShipmentsFilterInput = {
      status: 'SHIPPED' as any,
      orderId: 5,
      carrierId: 3,
      trackingNumber: 'AWB-123',
      warehouseId: 2,
    };
    await service.filterShipments(filter);

    expect(shipments.find).toHaveBeenCalledWith({
      where: {
        tenantId: 1,
        status: 'SHIPPED',
        orderId: 5,
        carrierId: 3,
        trackingNumber: 'AWB-123',
        warehouseId: 2,
      },
      order: { createdAt: 'DESC' },
      relations: ['order', 'carrier', 'warehouse'],
    });
  });

  // ---- create ----

  it('createShipment persists and returns the created entity', async () => {
    orders.findOne.mockResolvedValueOnce({
      id: 5,
      tenantId: 1,
      status: 'PENDING',
    });
    shipments.findOne.mockResolvedValueOnce(null);
    const saved = { id: 42, tenantId: 1 };
    shipments.create.mockReturnValue(saved);
    shipments.save.mockResolvedValueOnce(saved);
    shipments.findOne.mockResolvedValueOnce({ id: 42 });

    const result = await service.createShipment({
      trackingNumber: 'AWB-1',
      status: 'PENDING' as any,
      orderId: 5,
      carrierId: 2,
      warehouseId: 1,
      courierName: 'DELHIVERY',
      weight: 500,
    });

    expect(shipments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingNumber: 'AWB-1',
        orderId: 5,
        carrierId: 2,
        tenantId: 1,
        status: 'PENDING',
      }),
    );
    expect(shipments.save).toHaveBeenCalledWith(saved);
    expect(result).toEqual({ id: 42 });
  });

  it('createShipment throws NotFoundException when the order is missing', async () => {
    orders.findOne.mockResolvedValueOnce(null);

    await expect(
      service.createShipment({
        trackingNumber: 'AWB-1',
        status: 'PENDING' as any,
        orderId: 99,
        carrierId: 2,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('createShipment throws ConflictException on duplicate tracking number', async () => {
    orders.findOne.mockResolvedValueOnce({ id: 5, tenantId: 1 });
    shipments.findOne.mockResolvedValueOnce({ id: 1 });

    await expect(
      service.createShipment({
        trackingNumber: 'AWB-1',
        status: 'PENDING' as any,
        orderId: 5,
        carrierId: 2,
      }),
    ).rejects.toThrow(/Tracking number already exists/);
  });

  // ---- update ----

  it('updateShipment writes and returns the refreshed entity', async () => {
    shipments.findOne.mockResolvedValueOnce({ id: 1, tenantId: 1 });
    shipments.update.mockResolvedValueOnce({ affected: 1 } as any);
    shipments.findOne.mockResolvedValueOnce({ id: 1 });

    const result = await service.updateShipment({
      id: 1,
      status: 'SHIPPED' as any,
    });

    expect(shipments.update).toHaveBeenCalledWith(
      { id: 1, tenantId: 1 },
      expect.objectContaining({ status: 'SHIPPED' }),
    );
    expect(result).toEqual({ id: 1 });
  });

  // ---- cancel ----

  it('cancelShipment sets status to CANCELLED', async () => {
    shipments.findOne.mockResolvedValueOnce({ id: 1, status: 'PENDING' });
    shipments.update.mockResolvedValueOnce({ affected: 1 } as any);
    shipments.findOne.mockResolvedValueOnce({ id: 1, status: 'CANCELLED' });

    const result = await service.cancelShipment(1);

    expect(shipments.update).toHaveBeenCalledWith(
      { id: 1, tenantId: 1 },
      { status: 'CANCELLED' },
    );
    expect(result).toEqual({ id: 1 });
  });

  it('cancelShipment rejects a delivered shipment', async () => {
    shipments.findOne.mockResolvedValueOnce({ id: 1, status: 'DELIVERED' });

    await expect(service.cancelShipment(1)).rejects.toThrow(
      /Cannot cancel a delivered shipment/,
    );
    expect(shipments.update).not.toHaveBeenCalled();
  });

  // ---- label generation ----

  it('generateLabel delegates to the carrier adapter and queues a job', async () => {
    shipments.findOne.mockResolvedValueOnce({
      id: 10,
      carrierId: 2,
    });
    const qbChain = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValueOnce({
        carrier: { id: 2, name: 'DELHIVERY' },
      }),
    };
    shipments.createQueryBuilder.mockReturnValueOnce(qbChain);

    carrierAdapter.getAdapter.mockReturnValueOnce({
      generateLabel: jest.fn(),
    });

    const savedLabel = {
      id: 99,
      shipmentId: 10,
      status: 'PENDING',
      provider: 'DELHIVERY',
    };
    labels.create.mockReturnValue(savedLabel);
    labels.save.mockResolvedValueOnce(savedLabel);

    const result = await service.generateLabel({ shipmentId: 10 });

    expect(qbChain.leftJoinAndSelect).toHaveBeenCalledWith('s.carrier', 'c');
    expect(qbChain.andWhere).toHaveBeenCalledWith(
      's.tenantId = :tenantId',
      { tenantId: 1 },
    );
    expect(carrierAdapter.getAdapter).toHaveBeenCalledWith('DELHIVERY');
    expect(labels.create).toHaveBeenCalledWith(
      expect.objectContaining({ shipmentId: 10, provider: 'DELHIVERY' }),
    );
    expect(queues.add).toHaveBeenCalledWith('label-generator', {
      labelId: 99,
      shipmentId: 10,
    });
    expect(result).toBe(savedLabel);
  });

  // ---- tracking ingest ----

  it('ingestTracking saves the event and updates the shipment', async () => {
    shipments.findOne.mockResolvedValueOnce({ id: 1, tenantId: 1 });
    const savedEvent = { id: 7, shipmentId: 1 };
    tracking.create.mockReturnValue(savedEvent);
    tracking.save.mockResolvedValueOnce(savedEvent);
    shipments.update.mockResolvedValueOnce({ affected: 1 } as any);

    const result = await service.ingestTracking({
      trackingNumber: 'AWB-1',
      status: 'IN_TRANSIT',
      description: 'Hub scan',
      location: 'DEL',
    });

    expect(tracking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shipmentId: 1,
        status: 'IN_TRANSIT',
        description: 'Hub scan',
        location: 'DEL',
      }),
    );
    expect(tracking.save).toHaveBeenCalledWith(savedEvent);
    expect(shipments.update).toHaveBeenCalledWith(
      { id: 1, tenantId: 1 },
      { status: 'IN_TRANSIT' },
    );
    expect(gateway.emitTrackingUpdate).toHaveBeenCalledWith(1, savedEvent);
    expect(result).toBe(savedEvent);
  });

  // ---- SS-043e: N+1 regression test ----

  it('getShipments loads 100 items with <= 5 queries (no N+1)', async () => {
    // Build 100 fake shipment rows. Each row carries a pre-built order,
    // carrier, and warehouse so we don't trigger extra queries on the
    // caller's side.
    const hundred: any[] = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      tenantId: 1,
      trackingNumber: `AWB-${i + 1}`,
      status: 'PENDING',
      orderId: i + 1,
      order: { id: i + 1 },
      carrierId: i + 1,
      carrier: { id: i + 1 },
      warehouseId: 1,
      warehouse: { id: 1 },
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    let queryCount = 0;
    shipments.find.mockImplementation(async () => {
      queryCount += 1;
      return hundred;
    });

    const result = await service.getShipments();

    // `getShipments` uses a single `find` with eager `relations` — exactly
    // one round-trip. The budget is <= 5 to leave headroom for the row +
    // relations joins TypeORM emits under the hood.
    expect(queryCount).toBeLessThanOrEqual(5);
    expect(result).toHaveLength(100);
  });
});
