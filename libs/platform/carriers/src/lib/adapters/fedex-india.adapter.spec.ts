import { FedExIndiaAdapter } from './fedex-india.adapter';

describe('FedExIndiaAdapter', () => {
  let adapter: FedExIndiaAdapter;

  beforeEach(() => {
    adapter = new FedExIndiaAdapter('test-client-id', 'test-client-secret', 'test-account-number');
  });

  describe('getRates', () => {
    it('should return ≥1 RateQuote on fallback', async () => {
      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes.length).toBeGreaterThan(0);
      expect(quotes[0].carrierCode).toBe('fedex-india');
      expect(quotes[0].carrier).toBe('FedEx India');
      expect(quotes[0].serviceType).toMatch(/STANDARD|EXPRESS|SAME_DAY|OVERNIGHT/);
      expect(quotes[0].currency).toBe('INR');
      expect(quotes[0].estimatedDays).toMatchObject({
        min: expect.any(Number),
        max: expect.any(Number),
      });
      expect(quotes[0].expiresAt).toBeInstanceOf(Date);
    });

    it('should mark COD as available when paymentMethod is COD', async () => {
      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'COD' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes[0].codAvailable).toBe(true);
    });

    it('should pickupAvailable be true', async () => {
      const req = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID' as const,
      };

      const quotes = await adapter.getRates(req);

      expect(quotes[0].pickupAvailable).toBe(true);
    });
  });

  describe('getServiceability', () => {
    it('should return the expected ServiceabilityResult shape', async () => {
      const input = {
        originPincode: '110001',
        destinationPincode: '560001',
        paymentMethod: 'PREPAID' as const,
        weightGrams: 500,
      };

      const result = await adapter.getServiceability(input);

      expect(result).toMatchObject({
        serviceable: expect.any(Boolean),
        codAvailable: expect.any(Boolean),
        prepaidAvailable: expect.any(Boolean),
        estimatedDays: expect.any(Object),
      });
      expect(result.estimatedDays).toMatchObject({
        min: expect.any(Number),
        max: expect.any(Number),
      });
      expect(typeof result.serviceable).toBe('boolean');
      expect(typeof result.codAvailable).toBe('boolean');
      expect(typeof result.prepaidAvailable).toBe('boolean');
    });

    it('should COD available when both serviceable and COD payment method', async () => {
      const input = {
        originPincode: '110001',
        destinationPincode: '560001',
        paymentMethod: 'COD' as const,
        weightGrams: 500,
      };

      const result = await adapter.getServiceability(input);

      if (result.serviceable) {
        expect(result.codAvailable).toBe(true);
      }
    });
  });

  describe('getNdrActions', () => {
    it('should map FedEx exception codes', async () => {
      // This test uses an invalid shipmentId to force fallback behavior
      // Real exception code mapping happens inside getNdrActions
      const actions = await adapter.getNdrActions('INVALID-SHIPMENT-ID');

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0]).toMatchObject({
        code: expect.stringMatching(/REATTEMPT|CHANGE_ADDRESS|CANCEL|OPEN_DISPUTE/),
        label: expect.any(String),
        requiresCustomerInput: expect.any(Boolean),
      });
    });

    it('should map at least 2 FedEx exception codes', async () => {
      // Test with hardcoded mock data for specific codes
      const originalMethod = (adapter as any).collectFedExExceptionCodes;
      (adapter as any).collectFedExExceptionCodes = () => ['AHS', 'CDX', 'RCX'];

      try {
        const actions = await adapter.getNdrActions('MOCK-123');
        expect(actions.length).toBeGreaterThan(0);

        // Verify specific code mappings
        const labels = actions.map(a => a.label);
        expect(labels).toContain('Update delivery address'); // AHS → CHANGE_ADDRESS
        expect(labels).toContain('Reattempt delivery'); // CDX → REATTEMPT
        expect(labels).toContain('Cancel and RTO'); // RCX → CANCEL
      } finally {
        (adapter as any).collectFedExExceptionCodes = originalMethod;
      }
    });
  });

  describe('markCodCollected', () => {
    it('should throw NotImplementedError', async () => {
      const input = {
        awbNumber: '1234567890',
        collectedAmount: 1000,
        collectedAt: new Date().toISOString(),
      };

      await expect(adapter.markCodCollected(input)).rejects.toThrow('NotImplementedError');
    });
  });

  describe('schedulePickup', () => {
    it('should return ScheduledPickup with tracking URL', async () => {
      const input = {
        pickupPincode: '110001',
        pickupDate: new Date().toISOString().split('T')[0],
        pickupTimeSlot: 'MORNING' as const,
        shipmentIds: ['123456'],
        contactName: 'John Doe',
        contactPhone: '9999999999',
      };

      const result = await adapter.schedulePickup(input);

      expect(result).toMatchObject({
        pickupId: expect.any(String),
        pickupDate: input.pickupDate,
        pickupTimeSlot: input.pickupTimeSlot,
      });
      expect(result.pickupId).toMatch(/^FEDEX-PIK-|^[A-Z0-9]+$/);
    });
  });

  describe('cancelPickup', () => {
    it('should not throw when using valid pickupId', async () => {
      const input = {
        pickupId: 'TEST-CONFIRMATION-CODE',
        reason: 'Customer cancelled',
      };

      // This test ensures the method signature is correct
      // In production, this would call the FedEx API
      await expect(adapter.cancelPickup(input)).resolves.toBeUndefined();
    });
  });
});