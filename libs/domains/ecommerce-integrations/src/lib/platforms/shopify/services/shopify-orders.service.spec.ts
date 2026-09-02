import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ShopifyOrderEntity } from '@swiftship/platform-typeorm';
import { ShopifyOrdersService } from './shopify-orders.service';
import { ShopifyIntegrationService } from './shopify-integration.service';
import {
  CreateShopifyOrderInput,
  ShopifyOrderStatus,
} from '../dto/create-shopify-order.input';

/**
 * SS-101 — ShopifyOrdersService spec, ported from PrismaService mocks to
 * TypeORM repository mocks.
 */
describe('ShopifyOrdersService', () => {
  let service: ShopifyOrdersService;

  type RepositoryType = {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };

  const mockOrdersRepo: RepositoryType = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockShopifyIntegrationService = {
    getStoreById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyOrdersService,
        {
          provide: getRepositoryToken(ShopifyOrderEntity),
          useValue: mockOrdersRepo,
        },
        {
          provide: ShopifyIntegrationService,
          useValue: mockShopifyIntegrationService,
        },
      ],
    }).compile();

    service = module.get<ShopifyOrdersService>(ShopifyOrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getShopifyOrders', () => {
    const mockOrders = [
      {
        id: 'order-1',
        orderNumber: '1001',
        total: 100.0,
        status: ShopifyOrderStatus.PAID,
        storeId: 'store-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'order-2',
        orderNumber: '1002',
        total: 200.0,
        status: ShopifyOrderStatus.PENDING,
        storeId: 'store-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should return all orders', async () => {
      mockOrdersRepo.find.mockResolvedValue(mockOrders);

      const result = await service.getShopifyOrders();

      expect(mockOrdersRepo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({ id: 'order-1', orderNumber: '1001' });
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockOrdersRepo.find.mockRejectedValue(new Error('Database error'));

      await expect(service.getShopifyOrders()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getOrdersByStore', () => {
    const storeId = 'store-1';
    const mockOrders = [
      {
        id: 'order-1',
        orderNumber: '1001',
        total: 100.0,
        status: ShopifyOrderStatus.PAID,
        storeId: storeId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'order-2',
        orderNumber: '1002',
        total: 200.0,
        status: ShopifyOrderStatus.PENDING,
        storeId: storeId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should return orders for a specific store', async () => {
      mockShopifyIntegrationService.getStoreById.mockResolvedValue({
        id: storeId,
        shopDomain: 'test-store.myshopify.com',
      });
      mockOrdersRepo.find.mockResolvedValue(mockOrders);

      const result = await service.getOrdersByStore(storeId);

      expect(mockShopifyIntegrationService.getStoreById).toHaveBeenCalledWith(
        storeId,
      );
      expect(mockOrdersRepo.find).toHaveBeenCalledWith({
        where: { storeId },
        order: { createdAt: 'DESC' },
      });
      expect(result.length).toBe(2);
    });

    it('should throw NotFoundException if store does not exist', async () => {
      mockShopifyIntegrationService.getStoreById.mockRejectedValue(
        new NotFoundException(`Shopify store with ID ${storeId} not found`),
      );

      await expect(service.getOrdersByStore(storeId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockOrdersRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('getOrderById', () => {
    const orderId = 'order-1';
    const mockOrder = {
      id: orderId,
      orderNumber: '1001',
      total: 100.0,
      status: ShopifyOrderStatus.PAID,
      storeId: 'store-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return an order if found', async () => {
      mockOrdersRepo.findOne.mockResolvedValue(mockOrder);

      const result = await service.getOrderById(orderId);

      expect(mockOrdersRepo.findOne).toHaveBeenCalledWith({
        where: { id: orderId },
      });
      expect(result.id).toEqual(orderId);
    });

    it('should throw NotFoundException if order not found', async () => {
      mockOrdersRepo.findOne.mockResolvedValue(null);

      await expect(service.getOrderById(orderId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createOrder', () => {
    const storeId = 'store-1';
    const createOrderInput: CreateShopifyOrderInput = {
      orderNumber: '1001',
      total: 100.0,
      status: ShopifyOrderStatus.PENDING,
      storeId: storeId,
    };

    const mockOrder = {
      id: 'order-1',
      ...createOrderInput,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create an order successfully', async () => {
      mockShopifyIntegrationService.getStoreById.mockResolvedValue({
        id: storeId,
        shopDomain: 'test-store.myshopify.com',
      });
      mockOrdersRepo.create.mockReturnValue(mockOrder);
      mockOrdersRepo.save.mockResolvedValue(mockOrder);

      const result = await service.createOrder(createOrderInput);

      expect(mockShopifyIntegrationService.getStoreById).toHaveBeenCalledWith(
        storeId,
      );
      expect(mockOrdersRepo.create).toHaveBeenCalledWith({
        orderNumber: createOrderInput.orderNumber,
        total: createOrderInput.total,
        status: createOrderInput.status,
        storeId: createOrderInput.storeId,
      });
      expect(mockOrdersRepo.save).toHaveBeenCalled();
      expect(result.orderNumber).toEqual('1001');
    });

    it('should throw NotFoundException if store does not exist', async () => {
      mockShopifyIntegrationService.getStoreById.mockRejectedValue(
        new NotFoundException(`Shopify store with ID ${storeId} not found`),
      );

      await expect(service.createOrder(createOrderInput)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockOrdersRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateOrderStatus', () => {
    const orderId = 'order-1';
    const newStatus = ShopifyOrderStatus.FULFILLED;
    const mockOrder = {
      id: orderId,
      orderNumber: '1001',
      total: 100.0,
      status: ShopifyOrderStatus.PAID,
      storeId: 'store-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should update an order status successfully', async () => {
      mockOrdersRepo.findOne.mockResolvedValue(mockOrder);
      mockOrdersRepo.save.mockImplementation((order: unknown) => order);

      const result = await service.updateOrderStatus(orderId, newStatus);

      expect(mockOrdersRepo.findOne).toHaveBeenCalledWith({
        where: { id: orderId },
      });
      expect(mockOrder.status as any).toEqual(newStatus);
      expect(result.status as any).toEqual(newStatus);
      expect(mockOrdersRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if order does not exist', async () => {
      mockOrdersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateOrderStatus(orderId, newStatus),
      ).rejects.toThrow(NotFoundException);
      expect(mockOrdersRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteOrder', () => {
    const orderId = 'order-1';
    const mockOrder = {
      id: orderId,
      orderNumber: '1001',
      total: 100.0,
      status: ShopifyOrderStatus.PAID,
      storeId: 'store-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should delete an order successfully', async () => {
      mockOrdersRepo.findOne.mockResolvedValue(mockOrder);
      mockOrdersRepo.remove.mockResolvedValue(mockOrder);

      const result = await service.deleteOrder(orderId);

      expect(mockOrdersRepo.findOne).toHaveBeenCalledWith({
        where: { id: orderId },
      });
      expect(mockOrdersRepo.remove).toHaveBeenCalledWith(mockOrder);
      expect(result.id).toEqual(orderId);
    });

    it('should throw NotFoundException if order does not exist', async () => {
      mockOrdersRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteOrder(orderId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockOrdersRepo.remove).not.toHaveBeenCalled();
    });
  });
});
