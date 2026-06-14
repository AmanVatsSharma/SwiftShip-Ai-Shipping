import { ConfigService } from '@nestjs/config';
import { ProfessionalCouriersAdapter } from './professional-couriers.adapter';

const configService: ConfigService = {
  get: <T = unknown>(key: string): T | undefined => {
    return process.env[key] as unknown as T | undefined;
  },
} as unknown as ConfigService;

describe('ProfessionalCouriersAdapter', () => {
  let adapter: ProfessionalCouriersAdapter;

  beforeEach(() => {
    process.env.PCA_API_KEY = 'test_key';
    process.env.PCA_USERNAME = 'test_user';
    adapter = new ProfessionalCouriersAdapter(configService);
  });

  describe('getRates (fallback path)', () => {
    it('should return exactly 1 RateQuote with carrierCode === "professional-couriers"', async () => {
      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes).toHaveLength(1);
      expect(quotes[0].carrierCode).toBe('professional-couriers');
      expect(quotes[0].currency).toBe('INR');
    });
  });

  describe('getNdrActions (NDR code mapping)', () => {
    it('should expose REATTEMPT, CHANGE_ADDRESS, CANCEL for documented PCA codes', async () => {
      // In non-production we hit the default menu. Validate the default
      // action set covers the canonical codes that map from NA/WR/IN/RF.
      const actions = await adapter.getNdrActions('PCA123456');

      const codes = actions.map((a) => a.code).sort();
      expect(codes).toEqual(expect.arrayContaining(['REATTEMPT', 'CHANGE_ADDRESS', 'CANCEL']));
    });
  });
});
