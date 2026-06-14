import { ConfigService } from '@nestjs/config';
import { AramexAdapter } from './aramex.adapter';

const configService: ConfigService = {
  get: <T = unknown>(key: string): T | undefined => {
    return process.env[key] as unknown as T | undefined;
  },
} as unknown as ConfigService;

describe('AramexAdapter', () => {
  let adapter: AramexAdapter;

  beforeEach(() => {
    process.env.ARAMEX_ACCOUNT_NUMBER = '9900000';
    process.env.ARAMEX_USERNAME = 'test_user';
    process.env.ARAMEX_PASSWORD = 'test_pw';
    process.env.ARAMEX_PIN = '1234';
    adapter = new AramexAdapter(configService);
  });

  describe('getRates (fallback path)', () => {
    it('should return exactly 1 RateQuote with carrierCode === "aramex"', async () => {
      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes).toHaveLength(1);
      expect(quotes[0].carrierCode).toBe('aramex');
      expect(quotes[0].currency).toBe('INR');
    });
  });

  describe('getNdrActions (NDR code mapping)', () => {
    it('should map documented Aramex reason codes to canonical NDR actions', async () => {
      const actions = await adapter.getNdrActions('ARX123456');

      const codes = actions.map((a) => a.code).sort();
      // Default menu mirrors 11 (REATTEMPT), 12 (CHANGE_ADDRESS), 14 (CANCEL)
      expect(codes).toEqual(expect.arrayContaining(['REATTEMPT', 'CHANGE_ADDRESS', 'CANCEL']));
    });
  });
});
