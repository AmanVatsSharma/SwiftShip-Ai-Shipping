import { GatiAdapter } from './gati.adapter';
import {
  RateQuoteRequest,
  ServiceabilityRequest,
  MarkCodRequest,
} from '../adapter.interface';

describe('GatiAdapter', () => {
  const CLIENT_ID = 'test-client';
  const API_KEY = 'test-api-key';

  describe('constructor', () => {
    it('throws if clientId is missing', () => {
      expect(() => new GatiAdapter('', API_KEY)).toThrow(
        'Gati client ID and API key are required',
      );
    });

    it('throws if apiKey is missing', () => {
      expect(() => new GatiAdapter(CLIENT_ID, '')).toThrow(
        'Gati client ID and API key are required',
      );
    });

    it('uses https://api.gatikwe.com as the default base URL', () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      expect((adapter as any).baseUrl).toBe('https://api.gatikwe.com');
    });
  });

  describe('getRates', () => {
    it('returns at least one RateQuote on fallback (when API call fails)', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      // Stub the retry method to always throw so we exercise the fallback path.
      jest
        .spyOn(adapter as any, 'makeRequestWithRetry')
        .mockRejectedValue(new Error('network down'));

      const req: RateQuoteRequest = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 1000,
        paymentMethod: 'PREPAID',
      };

      const quotes = await adapter.getRates(req);
      expect(quotes.length).toBeGreaterThanOrEqual(1);
      expect(quotes[0].carrierCode).toBe('gati');
      expect(quotes[0].currency).toBe('INR');
      expect(quotes[0].serviceType).toBe('STANDARD');
      expect(typeof quotes[0].rate).toBe('number');
    });

    it('parses a live response into RateQuote objects with code "gati"', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      jest.spyOn(adapter as any, 'makeRequestWithRetry').mockResolvedValue({
        data: {
          data: {
            quotes: [
              {
                service_type: 'EXPRESS',
                rate: 245,
                estimated_days: { min: 1, max: 2 },
                cod_available: true,
                pickup_available: true,
              },
            ],
          },
        },
      });

      const quotes = await adapter.getRates({
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'COD',
      });

      expect(quotes).toHaveLength(1);
      expect(quotes[0].carrierCode).toBe('gati');
      expect(quotes[0].serviceType).toBe('EXPRESS');
      expect(quotes[0].rate).toBe(245);
      expect(quotes[0].codAvailable).toBe(true);
    });
  });

  describe('getServiceability', () => {
    it('returns a proper ServiceabilityResult on a live response', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      jest.spyOn(adapter as any, 'makeRequestWithRetry').mockResolvedValue({
        data: {
          data: {
            serviceable: true,
            cod_available: true,
            prepaid_available: true,
            estimated_days: { min: 2, max: 4 },
          },
        },
      });

      const result = await adapter.getServiceability({
        originPincode: '110001',
        destinationPincode: '560001',
        paymentMethod: 'COD',
        weightGrams: 1000,
      } as ServiceabilityRequest);

      expect(result.serviceable).toBe(true);
      expect(result.codAvailable).toBe(true);
      expect(result.prepaidAvailable).toBe(true);
      expect(result.estimatedDays).toEqual({ min: 2, max: 4 });
    });

    it('returns a non-serviceable result with a reason when the carrier says so', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      jest.spyOn(adapter as any, 'makeRequestWithRetry').mockResolvedValue({
        data: {
          data: {
            serviceable: false,
            cod_available: false,
            prepaid_available: false,
            reason: 'Pincode not serviceable by Gati',
          },
        },
      });

      const result = await adapter.getServiceability({
        originPincode: '110001',
        destinationPincode: '999999',
        paymentMethod: 'PREPAID',
        weightGrams: 500,
      } as ServiceabilityRequest);

      expect(result.serviceable).toBe(false);
      expect(result.reason).toMatch(/not serviceable/i);
    });

    it('falls back to a sane ServiceabilityResult on API error', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      jest
        .spyOn(adapter as any, 'makeRequestWithRetry')
        .mockRejectedValue(new Error('boom'));

      const result = await adapter.getServiceability({
        originPincode: '110001',
        destinationPincode: '560001',
        paymentMethod: 'PREPAID',
        weightGrams: 500,
      } as ServiceabilityRequest);

      expect(result.serviceable).toBe(true);
      expect(result.prepaidAvailable).toBe(true);
    });
  });

  describe('getNdrActions', () => {
    it('maps CUSTOMER_NOT_AVAILABLE -> REATTEMPT', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      jest.spyOn(adapter as any, 'makeRequestWithRetry').mockResolvedValue({
        data: {
          data: {
            actions: [{ reason: 'CUSTOMER_NOT_AVAILABLE' }],
          },
        },
      });

      const actions = await adapter.getNdrActions('GATI-AWB-1');
      expect(actions.length).toBeGreaterThanOrEqual(1);
      expect(actions[0].code).toBe('REATTEMPT');
    });

    it('maps ADDRESS_INCORRECT -> CHANGE_ADDRESS', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      jest.spyOn(adapter as any, 'makeRequestWithRetry').mockResolvedValue({
        data: {
          data: {
            actions: [{ reason: 'ADDRESS_INCORRECT' }],
          },
        },
      });

      const actions = await adapter.getNdrActions('GATI-AWB-2');
      expect(actions.length).toBeGreaterThanOrEqual(1);
      expect(actions[0].code).toBe('CHANGE_ADDRESS');
    });

    it('maps PHONE_OFF -> REATTEMPT', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      jest.spyOn(adapter as any, 'makeRequestWithRetry').mockResolvedValue({
        data: {
          data: {
            actions: [{ reason: 'PHONE_OFF' }],
          },
        },
      });

      const actions = await adapter.getNdrActions('GATI-AWB-3');
      expect(actions[0].code).toBe('REATTEMPT');
    });

    it('maps REFUSED -> CANCEL', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      jest.spyOn(adapter as any, 'makeRequestWithRetry').mockResolvedValue({
        data: {
          data: {
            actions: [{ reason: 'REFUSED' }],
          },
        },
      });

      const actions = await adapter.getNdrActions('GATI-AWB-4');
      expect(actions[0].code).toBe('CANCEL');
    });

    it('falls back to a default action menu on API error', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      jest
        .spyOn(adapter as any, 'makeRequestWithRetry')
        .mockRejectedValue(new Error('boom'));

      const actions = await adapter.getNdrActions('GATI-AWB-5');
      expect(actions.length).toBeGreaterThanOrEqual(2);
      const codes = actions.map((a) => a.code);
      expect(codes).toContain('REATTEMPT');
      expect(codes).toContain('CANCEL');
    });
  });

  describe('markCodCollected', () => {
    it('throws NotImplementedError because Gati auto-reconciles COD', async () => {
      const adapter = new GatiAdapter(CLIENT_ID, API_KEY);
      const req: MarkCodRequest = {
        awbNumber: 'GATI-AWB-1',
        collectedAmount: 1500,
        collectedAt: new Date().toISOString(),
      };

      await expect(adapter.markCodCollected(req)).rejects.toThrow(
        /NotImplementedError/,
      );
    });
  });
});
