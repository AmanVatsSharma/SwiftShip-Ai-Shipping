import { MyntraAdapter } from '../adapters/myntra.adapter';
import { MyntraAuthService } from '../myntra-auth.service';

describe('MyntraAdapter', () => {
  let adapter: MyntraAdapter;
  let authService: MyntraAuthService;

  beforeEach(() => {
    authService = new MyntraAuthService();
    adapter = new MyntraAdapter(authService);
  });

  it('has the correct channel code', () => {
    expect(adapter.code).toBe('MYNTRA');
  });

  it('isConfigured returns false when credentials are missing', () => {
    delete process.env.MYNTRA_API_KEY;
    delete process.env.MYNTRA_PARTNER_ID;
    expect(adapter.isConfigured()).toBe(false);
  });

  it('isConfigured returns true when both env vars are present', () => {
    process.env.MYNTRA_API_KEY = 'k';
    process.env.MYNTRA_PARTNER_ID = 'p';
    expect(adapter.isConfigured()).toBe(true);
  });

  it('pullOrders returns at least one luxury order', async () => {
    const orders = await adapter.pullOrders({
      channelCode: 'MYNTRA',
      tenantId: 'tenant-1',
    });
    expect(orders.length).toBeGreaterThanOrEqual(1);
    expect(orders[0].channelCode).toBe('MYNTRA');
    expect(orders[0].externalOrderId).toMatch(/^MNR/);
  });

  it('pushTracking resolves without throwing', async () => {
    await expect(
      adapter.pushTracking({
        channelCode: 'MYNTRA',
        tenantId: 'tenant-1',
        externalOrderId: 'MNR987654',
        carrierCode: 'Delhivery',
        trackingNumber: 'AWB111',
        items: [{ sku: 'SKU-MYN-LUX-001', quantity: 1 }],
      }),
    ).resolves.not.toThrow();
  });
});
