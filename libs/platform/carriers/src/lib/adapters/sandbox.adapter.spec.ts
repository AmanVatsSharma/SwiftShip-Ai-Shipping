import { SandboxCarrierAdapter } from './sandbox.adapter';

describe('SandboxCarrierAdapter', () => {
  let adapter: SandboxCarrierAdapter;

  beforeEach(() => {
    adapter = new SandboxCarrierAdapter();
  });

  describe('getRates', () => {
    it('should return exactly 1 RateQuote with metadata.sandbox === true', async () => {
      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes).toHaveLength(1);
      expect(quotes[0].metadata).toEqual({ sandbox: true });
    });
  });

  describe('getServiceability', () => {
    it('should return { serviceable: true, codAvailable: true } for valid 6-digit pincodes', async () => {
      const input = {
        originPincode: '110001',
        destinationPincode: '560001',
        paymentMethod: 'PREPAID' as const,
        weightGrams: 500,
      };

      const result = await adapter.getServiceability(input);

      expect(result.serviceable).toBe(true);
      expect(result.codAvailable).toBe(true);
    });

    it('should return { serviceable: false, reason: \'INVALID_PINCODE\' } for invalid pincodes', async () => {
      const input = {
        originPincode: '12345',
        destinationPincode: '560001',
        paymentMethod: 'PREPAID' as const,
        weightGrams: 500,
      };

      const result = await adapter.getServiceability(input);

      expect(result.serviceable).toBe(false);
      expect(result.reason).toBe('INVALID_PINCODE');
    });
  });

  describe('getNdrActions', () => {
    it('should return all 4 canonical actions', async () => {
      const actions = await adapter.getNdrActions('SANDBOX-123');

      expect(actions).toHaveLength(4);
      expect(actions.map(a => a.code)).toEqual([
        'REATTEMPT',
        'CHANGE_ADDRESS',
        'CANCEL',
        'OPEN_DISPUTE',
      ]);
    });
  });
});
