import axios from 'axios';
import { BlueDartAdapter } from './bluedart.adapter';
import { NotImplementedError } from './ecom-express.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BlueDartAdapter', () => {
  let adapter: BlueDartAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new BlueDartAdapter('test-api-key', 'test-login-id', 'https://apigateway.bluedart.com');
  });

  describe('getRates', () => {
    it('should return ≥1 RateQuote on fallback when the live API call fails', async () => {
      // Force the live HTTP path to fail so the static rate card kicks in.
      mockedAxios.mockRejectedValue(new Error('network unreachable'));

      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes.length).toBeGreaterThanOrEqual(1);
      expect(quotes[0]).toMatchObject({
        carrier: 'BlueDart',
        carrierCode: 'bluedart',
        currency: 'INR',
        pickupAvailable: true,
      });
      // Rates must be in paise (>0) and the service type must be one of
      // EXPRESS (Air) or STANDARD (Surface).
      expect(quotes[0].rate).toBeGreaterThan(0);
      expect(['EXPRESS', 'STANDARD']).toContain(quotes[0].serviceType);
      // Each fallback quote should expose the static-rate-card provenance.
      expect(quotes[0].rawResponse).toEqual({ source: 'static_rate_card' });
    });

    it('should return one Air + one Surface RateQuote on fallback', async () => {
      mockedAxios.mockRejectedValue(new Error('network unreachable'));

      const req = {
        originPincode: '110001',
        destinationPincode: '400001',
        weightGrams: 1000,
        paymentMethod: 'COD' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes).toHaveLength(2);
      const serviceTypes = quotes.map(q => q.serviceType).sort();
      expect(serviceTypes).toEqual(['EXPRESS', 'STANDARD']);
      // Air ETA is faster than Surface
      const air = quotes.find(q => q.serviceType === 'EXPRESS')!;
      const surface = quotes.find(q => q.serviceType === 'STANDARD')!;
      expect(air.estimatedDays.max).toBeLessThanOrEqual(surface.estimatedDays.max);
    });
  });

  describe('getServiceability', () => {
    it('should return { serviceable: false, reason: \'PINCODE_NOT_SERVICEABLE\' } for a known-unserviceable pair', async () => {
      const input = {
        originPincode: '110001',
        destinationPincode: '000000',
        paymentMethod: 'PREPAID' as const,
        weightGrams: 500,
      };

      const result = await adapter.getServiceability(input);

      expect(result).toEqual({
        serviceable: false,
        codAvailable: false,
        prepaidAvailable: false,
        reason: 'PINCODE_NOT_SERVICEABLE',
      });
      // Known-unserviceable should NOT even hit the live API.
      expect(mockedAxios).not.toHaveBeenCalled();
    });
  });

  describe('cancelPickup', () => {
    it('should throw NotImplementedError because BlueDart has no public cancel-pickup API', async () => {
      const input = {
        pickupId: 'BD-PU-110001-1700000000',
        reason: 'customer-requested',
      };

      await expect(adapter.cancelPickup(input)).rejects.toBeInstanceOf(NotImplementedError);
      await expect(adapter.cancelPickup(input)).rejects.toThrow(
        /cancelPickup is not implemented/i,
      );
    });
  });
});
