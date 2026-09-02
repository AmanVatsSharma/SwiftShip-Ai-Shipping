import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import {
  ShopifyStoreEntity,
  ShopifyOrderEntity,
} from '@swiftship/platform-typeorm';
import { ShopifyIntegrationService } from './shopify-integration.service';
import { ConnectStoreInput } from '../dto/connect-store.input';
import { AxiosResponse } from 'axios';

/**
 * SS-101 — ShopifyIntegrationService spec, ported from PrismaService mocks
 * to TypeORM repository mocks (getStoreToken pattern from the billing specs).
 */
describe('ShopifyIntegrationService', () => {
  let service: ShopifyIntegrationService;

  type RepositoryType = {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
    count: jest.Mock;
  };

  const mockStoresRepo: RepositoryType = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };

  const mockOrdersRepo: RepositoryType = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('2023-10'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyIntegrationService,
        {
          provide: getRepositoryToken(ShopifyStoreEntity),
          useValue: mockStoresRepo,
        },
        {
          provide: getRepositoryToken(ShopifyOrderEntity),
          useValue: mockOrdersRepo,
        },
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ShopifyIntegrationService>(ShopifyIntegrationService);
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
      const verifySpy = jest
        .spyOn(service, 'verifyCredentials')
        .mockResolvedValue();

      // Mock successful store creation
      mockStoresRepo.create.mockReturnValue(mockStoreData);
      mockStoresRepo.save.mockResolvedValue(mockStoreData);

      const result = await service.connectStore(connectInput);

      expect(verifySpy).toHaveBeenCalledWith(connectInput);
      expect(mockStoresRepo.save).toHaveBeenCalled();
      expect(result).toEqual({
        id: mockStoreData.id,
        shopDomain: mockStoreData.shopDomain,
        accessToken: mockStoreData.accessToken,
        connectedAt: mockStoreData.connectedAt,
        updatedAt: mockStoreData.updatedAt,
      });
    });

    it('should throw BadRequestException if credentials verification fails', async () => {
      // Mock failed verification
      jest
        .spyOn(service, 'verifyCredentials')
        .mockRejectedValue(
          new BadRequestException('Invalid Shopify credentials'),
        );

      await expect(service.connectStore(connectInput)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockStoresRepo.save).not.toHaveBeenCalled();
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
      mockStoresRepo.find.mockResolvedValue(mockStores);

      const result = await service.getStores();

      expect(mockStoresRepo.find).toHaveBeenCalled();
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        id: 'store-1',
        shopDomain: 'store1.myshopify.com',
      });
    });

    it('should throw InternalServerErrorException if database query fails', async () => {
      mockStoresRepo.find.mockRejectedValue(new Error('Database error'));

      await expect(service.getStores()).rejects.toThrow(
        InternalServerErrorException,
      );
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
      mockStoresRepo.findOne.mockResolvedValue(mockStore);

      const result = await service.getStoreById(storeId);

      expect(mockStoresRepo.findOne).toHaveBeenCalledWith({
        where: { id: storeId },
      });
      expect(result.id).toEqual(storeId);
    });

    it('should throw NotFoundException if store not found', async () => {
      mockStoresRepo.findOne.mockResolvedValue(null);

      await expect(service.getStoreById(storeId)).rejects.toThrow(
        NotFoundException,
      );
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
      mockStoresRepo.findOne.mockResolvedValue(mockStore);
      mockOrdersRepo.count.mockResolvedValue(0);
      mockStoresRepo.remove.mockResolvedValue(mockStore);

      const result = await service.disconnectStore(storeId);

      expect(mockStoresRepo.findOne).toHaveBeenCalledWith({
        where: { id: storeId },
      });
      expect(mockOrdersRepo.count).toHaveBeenCalledWith({ where: { storeId } });
      expect(mockStoresRepo.remove).toHaveBeenCalledWith(mockStore);
      expect(result.id).toEqual(storeId);
    });

    it('should throw BadRequestException if store has orders', async () => {
      mockStoresRepo.findOne.mockResolvedValue(mockStore);
      mockOrdersRepo.count.mockResolvedValue(5);

      await expect(service.disconnectStore(storeId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockStoresRepo.remove).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if store not found', async () => {
      mockStoresRepo.findOne.mockResolvedValue(null);

      await expect(service.disconnectStore(storeId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockOrdersRepo.count).not.toHaveBeenCalled();
      expect(mockStoresRepo.remove).not.toHaveBeenCalled();
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
        config: {} as AxiosResponse['config'],
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      await service.verifyCredentials(credentials);

      expect(mockHttpService.get).toHaveBeenCalledWith(
        `https://${credentials.shopDomain}/admin/api/2023-10/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': credentials.accessToken,
          },
        },
      );
    });

    it('should throw BadRequestException if API request fails', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('API Error')),
      );

      await expect(service.verifyCredentials(credentials)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if API response status is not 200', async () => {
      const mockResponse: AxiosResponse = {
        data: { errors: 'Invalid token' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: {} as AxiosResponse['config'],
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      await expect(service.verifyCredentials(credentials)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
