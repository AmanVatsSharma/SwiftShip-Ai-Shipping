import { DelhiveryAdapter } from './delhivery.adapter';

// Default mock: node-fetch returns a 500-style failure so the adapter falls
// back to the static rate card. Individual tests override this to inject a
// real Delhivery-shaped response (track endpoint, pincode endpoint, etc.).
const mockFetch = jest.fn(() =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
);
jest.mock('node-fetch', () => mockFetch);

describe('DelhiveryAdapter — new interface methods (SS-007)', () => {
  let adapter: DelhiveryAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
    );
    adapter = new DelhiveryAdapter('test-token', 'https://track.delhivery.com');
  });

  describe('getRates', () => {
    it('returns at least 1 RateQuote when the live call fails (fallback path)', async () => {
      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes.length).toBeGreaterThanOrEqual(1);
      expect(quotes[0].carrierCode).toBe('delhivery');
      expect(quotes[0].currency).toBe('INR');
      expect(quotes[0].rate).toBeGreaterThan(0);
      expect(quotes[0].estimatedDays).toBeDefined();
      expect(quotes[0].estimatedDays.min).toBeGreaterThan(0);
    });
  });

  describe('getServiceability', () => {
    it("returns { serviceable: false, reason: 'PINCODE_NOT_SERVICEABLE' } for an un-serviceable pincode pair", async () => {
      const input = {
        originPincode: '000000', // invalid → static fallback rejects
        destinationPincode: '560001',
        paymentMethod: 'PREPAID' as const,
        weightGrams: 500,
      };

      const result = await adapter.getServiceability(input);

      expect(result.serviceable).toBe(false);
      expect(result.reason).toBe('PINCODE_NOT_SERVICEABLE');
    });
  });

  describe('getNdrActions', () => {
    it("returns REATTEMPT for the 'Customer unavailable' Delhivery NDR reason", async () => {
      // Mock the Delhivery /api/track/{awb} response with an NDR scan.
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ShipmentData: [
              {
                Scans: [
                  {
                    ScanDetail: 'Customer unavailable',
                    ScanDateTime: '2026-06-12T10:00:00',
                    reason: 'Customer unavailable',
                    NDRCode: 1,
                  },
                ],
              },
            ],
          }),
        }),
      );

      const actions = await adapter.getNdrActions('DLV-AWB-123');

      expect(actions.length).toBeGreaterThan(0);
      const reattempt = actions.find((a) => a.code === 'REATTEMPT');
      expect(reattempt).toBeDefined();
      expect(reattempt!.label).toBe('Reattempt delivery');
      expect(reattempt!.requiresCustomerInput).toBe(false);
    });
  });
});
