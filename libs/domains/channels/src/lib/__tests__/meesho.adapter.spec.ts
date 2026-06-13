import { MeeshoAdapter } from '../adapters/meesho.adapter';
import { MeeshoAuthService } from '../meesho-auth.service';

describe('MeeshoAdapter', () => {
  let adapter: MeeshoAdapter;
  let authService: MeeshoAuthService;

  beforeEach(() => {
    authService = new MeeshoAuthService();
    adapter = new MeeshoAdapter(authService);
  });

  it('has the correct channel code', () => {
    expect(adapter.code).toBe('MEESHO');
  });

  it('isConfigured returns false when credentials are missing', () => {
    delete process.env.MEESHO_API_KEY;
    delete process.env.MEESHO_SUPPLIER_ID;
    expect(adapter.isConfigured()).toBe(false);
  });

  it('isConfigured returns true when both env vars are present', () => {
    process.env.MEESHO_API_KEY = 'k';
    process.env.MEESHO_SUPPLIER_ID = 's';
    expect(adapter.isConfigured()).toBe(true);
  });

  it('pullOrders returns a non-empty array of ChannelOrder', async () => {
    const orders = await adapter.pullOrders({
      channelCode: 'MEESHO',
      tenantId: 'tenant-1',
    });
    expect(orders.length).toBeGreaterThanOrEqual(2);
    expect(orders[0].channelCode).toBe('MEESHO');
    expect(orders[0].externalOrderId).toMatch(/^MSH/);
  });

  it('pushTracking resolves without throwing', async () => {
    await expect(
      adapter.pushTracking({
        channelCode: 'MEESHO',
        tenantId: 'tenant-1',
        externalOrderId: 'MSH123456',
        carrierCode: 'Delhivery',
        trackingNumber: 'AWB999',
        items: [{ sku: 'SKU-MESH-001', quantity: 5 }],
      }),
    ).resolves.not.toThrow();
  });
});
