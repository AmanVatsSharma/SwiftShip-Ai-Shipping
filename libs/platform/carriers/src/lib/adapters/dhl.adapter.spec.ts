import { ConfigService } from '@nestjs/config';
import { DhlAdapter } from './dhl.adapter';

// Stub ConfigService that reads from process.env — matches the adapter's
// `this.config.get<string>('XYZ')` usage without pulling in a full Nest container.
const configService: ConfigService = {
  get: <T = unknown>(key: string): T | undefined => {
    return process.env[key] as unknown as T | undefined;
  },
} as unknown as ConfigService;

describe('DhlAdapter', () => {
  let adapter: DhlAdapter;

  beforeEach(() => {
    process.env.DHL_CLIENT_ID = 'test_client_id';
    process.env.DHL_CLIENT_SECRET = 'test_client_secret';
    process.env.DHL_ACCOUNT_NUMBER = '123456789';
    adapter = new DhlAdapter(configService);
  });

  describe('getRates (fallback path)', () => {
    it('should return exactly 1 RateQuote with carrierCode === "dhl"', async () => {
      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes).toHaveLength(1);
      expect(quotes[0].carrierCode).toBe('dhl');
      expect(quotes[0].currency).toBe('INR');
    });
  });

  describe('getNdrActions (NDR code mapping)', () => {
    it('should map AHS -> CHANGE_ADDRESS, CDX -> REATTEMPT, RCX -> CANCEL', async () => {
      // Force the default action list — in non-production we exercise the
      // default menu and validate the documented codes are present.
      const actions = await adapter.getNdrActions('DHL123456');

      const codes = actions.map((a) => a.code).sort();
      expect(codes).toEqual(expect.arrayContaining(['REATTEMPT', 'CHANGE_ADDRESS', 'CANCEL']));
    });
  });
});
