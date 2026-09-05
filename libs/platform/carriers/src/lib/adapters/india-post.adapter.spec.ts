import { ConfigService } from '@nestjs/config';
import { IndiaPostAdapter } from './india-post.adapter';

const configService: ConfigService = {
  get: <T = unknown>(key: string): T | undefined => {
    return process.env[key] as unknown as T | undefined;
  },
} as unknown as ConfigService;

describe('IndiaPostAdapter', () => {
  let adapter: IndiaPostAdapter;

  beforeEach(() => {
    process.env.INDIAPOST_API_KEY = 'test_key';
    process.env.INDIAPOST_CUSTOMER_ID = 'test_cust';
    adapter = new IndiaPostAdapter(configService);
  });

  describe('getRates (fallback path)', () => {
    it('should return exactly 1 RateQuote with carrierCode === "india-post"', async () => {
      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes).toHaveLength(1);
      expect(quotes[0].carrierCode).toBe('india-post');
      expect(quotes[0].currency).toBe('INR');
      // Pickup is not programmatically available for India Post
      expect(quotes[0].pickupAvailable).toBe(false);
    });
  });

  describe('schedulePickup (NotImplementedError)', () => {
    it('should throw because India Post has no programmatic pickup API', async () => {
      const input = {
        pickupPincode: '110001',
        pickupDate: '2026-06-15',
        pickupTimeSlot: 'MORNING' as const,
        shipmentIds: ['SP123'],
        contactName: 'Tester',
        contactPhone: '9999999999',
      };

      await expect(adapter.schedulePickup(input)).rejects.toThrow(
        /Not implemented/i,
      );
    });
  });
});
