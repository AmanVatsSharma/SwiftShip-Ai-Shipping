import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ShopifyIntegrationService } from './shopify-integration.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ConnectStoreInput } from '../dto/connect-store.input';
import { AxiosResponse } from 'axios';

describe('ShopifyIntegrationService', () => {
  let service: ShopifyIntegrationService;
  let prismaService: PrismaService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockPrismaService = {
    shopifyStore: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    shopifyOrder: {
      count: jest.fn(),
    },
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('2023-10'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyIntegrationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ShopifyIntegrationService>(ShopifyIntegrationService);
    prismaService = module.get<PrismaService>(PrismaService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('connectStore', () => {
    const connectInput: ConnectStoreInput = {
      shopDomain: 'test-store.myshopify.com',
      accessToken: 'test-token',
    };

    const mockStoreData = {
      id: 'store-id',
      shopDomain: 'test-store.myshopify.com',
      accessToken: 'test-token',
      connectedAt: new Date(),
      updatedAt: new Date(),
    };

    it('should connect to a Shopify store successfully', async () => {
      // Mock successful verification
      jest.spyOn(service, 'verifyCredentials').mockResolvedValue();
      
      // Mock successful store creation
      mockPrismaService.shopifyStore.create.mockResolvedValue(mockStoreData);

      const result = await service.connectStore(connectInput);

      expect(service.verifyCredentials).toHaveBeenCalledWith(connectInput);
      expect(mockPrismaService.shopifyStore.create).toHaveBeenCalled();
      expect(result).toEqual(mockStoreData);
    });

    it('should throw BadRequestException if credentials verification fails', async () => {
      // Mock failed verification
      jest.spyOn(service, 'verifyCredentials').mockRejectedValue(
        new BadRequestException('Invalid Shopify credentials')
      );

      await expect(service.connectStore(connectInput)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.shopifyStore.create).not.toHaveBeenCalled();
    });
  });

  describe('getStores', () => {
    const mockStores = [
      {
        id: 'store-1',
        shopDomain: 'store1.myshopify.com',
        accessToken: 'token1',
        connectedAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'store-2',
        shopDomain: 'store2.myshopify.com',
        accessToken: 'token2',
        connectedAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should return all Shopify stores', async () => {
      mockPrismaService.shopifyStore.findMany.mockResolvedValue(mockStores);

      const result = await service.getStores();

      expect(mockPrismaService.shopifyStore.findMany).toHaveBeenCalled();
      expect(result).toEqual(mockStores);
      expect(result.length).toBe(2);
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockPrismaService.shopifyStore.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getStores()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getStoreById', () => {
    const storeId = 'store-id';
    const mockStore = {
      id: storeId,
      shopDomain: 'test-store.myshopify.com',
      accessToken: 'test-token',
      connectedAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return the store if found', async () => {
      mockPrismaService.shopifyStore.findUnique.mockResolvedValue(mockStore);

      const result = await service.getStoreById(storeId);

      expect(mockPrismaService.shopifyStore.findUnique).toHaveBeenCalledWith({
        where: { id: storeId },
      });
      expect(result).toEqual(mockStore);
    });

    it('should throw NotFoundException if store not found', async () => {
      mockPrismaService.shopifyStore.findUnique.mockResolvedValue(null);

      await expect(service.getStoreById(storeId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('disconnectStore', () => {
    const storeId = 'store-id';
    const mockStore = {
      id: storeId,
      shopDomain: 'test-store.myshopify.com',
      accessToken: 'test-token',
      connectedAt: new Date(),
      updatedAt: new Date(),
    };

    it('should disconnect a store successfully if no orders exist', async () => {
      mockPrismaService.shopifyStore.findUnique.mockResolvedValue(mockStore);
      mockPrismaService.shopifyOrder.count.mockResolvedValue(0);
      mockPrismaService.shopifyStore.delete.mockResolvedValue(mockStore);

      const result = await service.disconnectStore(storeId);

      expect(mockPrismaService.shopifyStore.findUnique).toHaveBeenCalledWith({
        where: { id: storeId },
      });
      expect(mockPrismaService.shopifyOrder.count).toHaveBeenCalledWith({
        where: { storeId },
      });
      expect(mockPrismaService.shopifyStore.delete).toHaveBeenCalledWith({
        where: { id: storeId },
      });
      expect(result).toEqual(mockStore);
    });

    it('should throw BadRequestException if store has orders', async () => {
      mockPrismaService.shopifyStore.findUnique.mockResolvedValue(mockStore);
      mockPrismaService.shopifyOrder.count.mockResolvedValue(5);

      await expect(service.disconnectStore(storeId)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.shopifyStore.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if store not found', async () => {
      mockPrismaService.shopifyStore.findUnique.mockResolvedValue(null);

      await expect(service.disconnectStore(storeId)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.shopifyOrder.count).not.toHaveBeenCalled();
      expect(mockPrismaService.shopifyStore.delete).not.toHaveBeenCalled();
    });
  });

  describe('verifyCredentials', () => {
    const credentials: ConnectStoreInput = {
      shopDomain: 'test-store.myshopify.com',
      accessToken: 'test-token',
    };

    it('should verify credentials successfully', async () => {
      const mockResponse: AxiosResponse = {
        data: { shop: { id: 123, name: 'Test Store' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: undefined as any
        }
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      await service.verifyCredentials(credentials);

      expect(mockHttpService.get).toHaveBeenCalledWith(
        `https://${credentials.shopDomain}/admin/api/2023-10/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': credentials.accessToken,
          },
        }
      );
    });

    it('should throw BadRequestException if API request fails', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('API Error'))
      );

      await expect(service.verifyCredentials(credentials)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if API response status is not 200', async () => {
      const mockResponse: AxiosResponse = {
        data: { errors: 'Invalid token' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: {
          headers: undefined as any
        }
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      await expect(service.verifyCredentials(credentials)).rejects.toThrow(BadRequestException);
    });
  });
}); 