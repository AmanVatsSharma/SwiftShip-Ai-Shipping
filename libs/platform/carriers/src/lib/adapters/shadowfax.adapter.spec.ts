import axios from 'axios';
import { ShadowfaxAdapter } from './shadowfax.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ShadowfaxAdapter', () => {
  let adapter: ShadowfaxAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new ShadowfaxAdapter(
      'test-api-key',
      'test-secret-key',
      'https://api.shadowfax.in',
    );
  });

  describe('getRates', () => {
    it('should return ≥1 RateQuote on fallback when the live API call fails', async () => {
      // Force the live HTTP path to fail so the static rate card kicks in.
      mockedAxios.mockRejectedValue(new Error('network unreachable'));

      const req = {
        originPincode: '560001',
        destinationPincode: '110001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes.length).toBeGreaterThanOrEqual(1);
      expect(quotes[0]).toMatchObject({
        carrier: 'Shadowfax',
        carrierCode: 'shadowfax',
        currency: 'INR',
        pickupAvailable: true,
      });
      // Rate is in INR and > 0.
      expect(quotes[0].rate).toBeGreaterThan(0);
      // Standard service type on cross-region fallback (560 → 110 != same hyperlocal cluster).
      expect(['STANDARD', 'SAME_DAY']).toContain(quotes[0].serviceType);
      // Fallback provenance should be the static rate card.
      expect(quotes[0].rawResponse).toEqual(
        expect.objectContaining({ source: 'shadowfax-fallback' }),
      );
    });
  });

  describe('getServiceability', () => {
    it('should return { serviceable: true, isHyperlocal: true, ... } for a known-hyperlocal pair', async () => {
      // Force the live HTTP path to fail so the heuristic fallback runs.
      mockedAxios.mockRejectedValue(new Error('network unreachable'));

      // 110001 and 110099 share the first 3 digits (110*) -> same metro cluster.
      const input = {
        originPincode: '110001',
        destinationPincode: '110099',
        paymentMethod: 'PREPAID' as const,
        weightGrams: 500,
      };

      const result = await adapter.getServiceability(input);

      expect(result.serviceable).toBe(true);
      expect(result.codAvailable).toBe(true);
      expect(result.prepaidAvailable).toBe(true);
      // Hyperlocal flag should be carried alongside the canonical result.
      expect((result as { isHyperlocal?: boolean }).isHyperlocal).toBe(true);
    });
  });

  describe('getNdrActions', () => {
    it('should map CUSTOMER_UNAVAILABLE -> REATTEMPT and ADDRESS_ISSUE -> CHANGE_ADDRESS', async () => {
      // Mock the /v3/ndr_actions?awb=... call to return both reasons.
      mockedAxios.mockResolvedValue({
        data: {
          reasons: ['CUSTOMER_UNAVAILABLE', 'ADDRESS_ISSUE'],
        },
      } as any);

      const actions = await adapter.getNdrActions('SF-AWB-001');

      const codes = actions.map((a) => a.code);
      expect(codes).toEqual(
        expect.arrayContaining(['REATTEMPT', 'CHANGE_ADDRESS']),
      );

      const reattempt = actions.find((a) => a.code === 'REATTEMPT')!;
      const changeAddress = actions.find((a) => a.code === 'CHANGE_ADDRESS')!;
      expect(reattempt).toBeDefined();
      expect(changeAddress).toBeDefined();
      // Customer-confirmed address changes require customer input.
      expect(changeAddress.requiresCustomerInput).toBe(true);
    });
  });
});
