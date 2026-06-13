import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ShopifyOrdersService } from './shopify-orders.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ShopifyIntegrationService } from './shopify-integration.service';
import { CreateShopifyOrderInput, ShopifyOrderStatus } from '../dto/create-shopify-order.input';

describe('ShopifyOrdersService', () => {
  let service: ShopifyOrdersService;
  let prismaService: PrismaService;
  let shopifyIntegrationService: ShopifyIntegrationService;

  const mockPrismaService = {
    shopifyOrder: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockShopifyIntegrationService = {
    getStoreById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyOrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ShopifyIntegrationService, useValue: mockShopifyIntegrationService },
      ],
    }).compile();

    service = module.get<ShopifyOrdersService>(ShopifyOrdersService);
    prismaService = module.get<PrismaService>(PrismaService);
    shopifyIntegrationService = module.get<ShopifyIntegrationService>(ShopifyIntegrationService);
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
      mockPrismaService.shopifyOrder.findMany.mockResolvedValue(mockOrders);

      const result = await service.getShopifyOrders();

      expect(mockPrismaService.shopifyOrder.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' }
      });
      expect(result).toEqual(mockOrders);
      expect(result.length).toBe(2);
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockPrismaService.shopifyOrder.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getShopifyOrders()).rejects.toThrow(InternalServerErrorException);
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
      mockPrismaService.shopifyOrder.findMany.mockResolvedValue(mockOrders);

      const result = await service.getOrdersByStore(storeId);

      expect(mockShopifyIntegrationService.getStoreById).toHaveBeenCalledWith(storeId);
      expect(mockPrismaService.shopifyOrder.findMany).toHaveBeenCalledWith({
        where: { storeId },
        orderBy: { createdAt: 'desc' }
      });
      expect(result).toEqual(mockOrders);
      expect(result.length).toBe(2);
    });

    it('should throw NotFoundException if store does not exist', async () => {
      mockShopifyIntegrationService.getStoreById.mockRejectedValue(
        new NotFoundException(`Shopify store with ID ${storeId} not found`)
      );

      await expect(service.getOrdersByStore(storeId)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.shopifyOrder.findMany).not.toHaveBeenCalled();
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
      mockPrismaService.shopifyOrder.findUnique.mockResolvedValue(mockOrder);

      const result = await service.getOrderById(orderId);

      expect(mockPrismaService.shopifyOrder.findUnique).toHaveBeenCalledWith({
        where: { id: orderId }
      });
      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundException if order not found', async () => {
      mockPrismaService.shopifyOrder.findUnique.mockResolvedValue(null);

      await expect(service.getOrderById(orderId)).rejects.toThrow(NotFoundException);
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
      mockPrismaService.shopifyOrder.create.mockResolvedValue(mockOrder);

      const result = await service.createOrder(createOrderInput);

      expect(mockShopifyIntegrationService.getStoreById).toHaveBeenCalledWith(storeId);
      expect(mockPrismaService.shopifyOrder.create).toHaveBeenCalledWith({
        data: {
          orderNumber: createOrderInput.orderNumber,
          total: createOrderInput.total,
          status: createOrderInput.status,
          storeId: createOrderInput.storeId,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }
      });
      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundException if store does not exist', async () => {
      mockShopifyIntegrationService.getStoreById.mockRejectedValue(
        new NotFoundException(`Shopify store with ID ${storeId} not found`)
      );

      await expect(service.createOrder(createOrderInput)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.shopifyOrder.create).not.toHaveBeenCalled();
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

    const updatedOrder = {
      ...mockOrder,
      status: newStatus,
      updatedAt: new Date(),
    };

    it('should update an order status successfully', async () => {
      mockPrismaService.shopifyOrder.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.shopifyOrder.update.mockResolvedValue(updatedOrder);

      const result = await service.updateOrderStatus(orderId, newStatus);

      expect(mockPrismaService.shopifyOrder.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: {
          status: newStatus,
          updatedAt: expect.any(Date),
        }
      });
      expect(result).toEqual(updatedOrder);
    });

    it('should throw NotFoundException if order does not exist', async () => {
      mockPrismaService.shopifyOrder.findUnique.mockResolvedValue(null);

      await expect(service.updateOrderStatus(orderId, newStatus)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.shopifyOrder.update).not.toHaveBeenCalled();
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
      mockPrismaService.shopifyOrder.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.shopifyOrder.delete.mockResolvedValue(mockOrder);

      const result = await service.deleteOrder(orderId);

      expect(mockPrismaService.shopifyOrder.findUnique).toHaveBeenCalledWith({
        where: { id: orderId }
      });
      expect(mockPrismaService.shopifyOrder.delete).toHaveBeenCalledWith({
        where: { id: orderId }
      });
      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundException if order does not exist', async () => {
      mockPrismaService.shopifyOrder.findUnique.mockResolvedValue(null);

      await expect(service.deleteOrder(orderId)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.shopifyOrder.delete).not.toHaveBeenCalled();
    });
  });
}); 