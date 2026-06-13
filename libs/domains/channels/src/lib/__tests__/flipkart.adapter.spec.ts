import { NotImplementedException } from '@nestjs/common';
import { FlipkartAdapter } from '../adapters/flipkart.adapter';
import { FlipkartAuthService } from '../flipkart-auth.service';

describe('FlipkartAdapter', () => {
  let adapter: FlipkartAdapter;
  let authService: FlipkartAuthService;

  beforeEach(() => {
    authService = new FlipkartAuthService();
    adapter = new FlipkartAdapter(authService);
  });

  describe('isConfigured', () => {
    it('should return false when credentials are missing', () => {
      delete process.env.FLIPKART_APP_ID;
      delete process.env.FLIPKART_APP_SECRET;
      delete process.env.FLIPKART_SELLER_ID;
      expect(adapter.isConfigured()).toBe(false);
    });

    it('should return true when all credentials are present', () => {
      process.env.FLIPKART_APP_ID = 'test_app_id';
      process.env.FLIPKART_APP_SECRET = 'test_app_secret';
      process.env.FLIPKART_SELLER_ID = 'test_seller_id';
      expect(adapter.isConfigured()).toBe(true);
    });
  });

  describe('code', () => {
    it('should have the correct channel code', () => {
      expect(adapter.code).toBe('FLIPKART');
    });
  });

  describe('pullOrders', () => {
    it('should pull orders and return a ChannelOrder array', async () => {
      const orders = await adapter.pullOrders({
        channelCode: 'FLIPKART',
        tenantId: 'tenant-1',
        createdAfter: '2026-01-01T00:00:00Z',
        lastUpdatedAfter: '2026-01-31T23:59:59Z',
      });
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
      const order = orders[0];
      expect(order.externalOrderId).toBe('OD0123456789');
      expect(order.channelCode).toBe('FLIPKART');
      expect(order.customer?.name).toBe('Rajesh Kumar');
      expect(order.items.length).toBeGreaterThan(0);
      expect(order.currency).toBe('INR');
    });

    it('should work without optional parameters', async () => {
      const orders = await adapter.pullOrders({
        channelCode: 'FLIPKART',
        tenantId: 'tenant-1',
      });
      expect(Array.isArray(orders)).toBe(true);
    });
  });

  describe('pushTracking', () => {
    it('should push tracking without errors', async () => {
      await expect(
        adapter.pushTracking({
          channelCode: 'FLIPKART',
          tenantId: 'tenant-1',
          externalOrderId: 'OD0123456789',
          carrierCode: 'Delhivery',
          trackingNumber: 'AWB123456789',
          items: [{ sku: 'FK-SKU-001', quantity: 1 }],
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('syncInventory', () => {
    it('should throw NotImplementedException', async () => {
      await expect(
        adapter.syncInventory({
          channelCode: 'FLIPKART',
          tenantId: 'tenant-1',
          warehouseCode: 'WH-001',
          items: [{ sku: 'FK-SKU-001', quantity: 100 }],
        }),
      ).rejects.toThrow(NotImplementedException);
    });
  });

  describe('pullReturns', () => {
    it('should throw NotImplementedException', async () => {
      await expect(
        adapter.pullReturns({ channelCode: 'FLIPKART', tenantId: 'tenant-1' }),
      ).rejects.toThrow(NotImplementedException);
    });
  });
});
