import { XpressbeesAdapter } from './xpressbees.adapter';
import {
  CancelPickupRequest,
  MarkCodRequest,
  NdrActionOption,
  RateQuoteRequest,
  SchedulePickupRequest,
  ServiceabilityRequest,
} from '../adapter.interface';

describe('XpressbeesAdapter (rate-shopping / pickup / NDR)', () => {
  // We intentionally construct the adapter with no token so that the static
  // rate card / fallback paths are exercised. This is how the rate-shop
  // acceptance test ("≥1 RateQuote per carrier") will hit Xpressbees.
  const adapter = new XpressbeesAdapter(undefined, 'https://api.xpressbees.com');

  describe('getRates', () => {
    it('returns at least one RateQuote on the static rate card fallback', async () => {
      const req: RateQuoteRequest = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID',
      };

      const quotes = await adapter.getRates(req);

      expect(Array.isArray(quotes)).toBe(true);
      expect(quotes.length).toBeGreaterThanOrEqual(1);
      // Acceptance for SS-007: carrierCode must be 'xpressbees'
      for (const q of quotes) {
        expect(q.carrierCode).toBe('xpressbees');
        expect(q.currency).toBe('INR');
        expect(q.rate).toBeGreaterThan(0);
        expect(q.expiresAt).toBeInstanceOf(Date);
        expect(q.estimatedDays.min).toBeGreaterThanOrEqual(0);
        expect(q.estimatedDays.max).toBeGreaterThanOrEqual(q.estimatedDays.min);
      }
    });

    it('charges a COD surcharge on COD shipments versus prepaid', async () => {
      const base: RateQuoteRequest = {
        originPincode: '110001',
        destinationPincode: '560001',
        weightGrams: 500,
        paymentMethod: 'PREPAID',
      };
      const cod: RateQuoteRequest = { ...base, paymentMethod: 'COD' };

      const prepaidQuotes = await adapter.getRates(base);
      const codQuotes = await adapter.getRates(cod);

      expect(prepaidQuotes[0].rate).toBeLessThan(codQuotes[0].rate);
      expect(codQuotes[0].codAvailable).toBe(true);
    });
  });

  describe('getServiceability', () => {
    it('returns { serviceable: true, codAvailable: true } for a known-good pincode pair', async () => {
      const input: ServiceabilityRequest = {
        originPincode: '110001',
        destinationPincode: '560001',
        paymentMethod: 'PREPAID',
        weightGrams: 500,
      };

      const result = await adapter.getServiceability(input);

      expect(result.serviceable).toBe(true);
      expect(result.codAvailable).toBe(true);
      // prepaidAvailable may be true on fallback; we don't pin it here
    });

    it('rejects malformed pincodes with reason INVALID_PINCODE', async () => {
      const result = await adapter.getServiceability({
        originPincode: 'abc',
        destinationPincode: '560001',
        paymentMethod: 'PREPAID',
        weightGrams: 500,
      });

      expect(result.serviceable).toBe(false);
      expect(result.codAvailable).toBe(false);
      expect(result.reason).toBe('INVALID_PINCODE');
    });
  });

  describe('schedulePickup / cancelPickup', () => {
    it('schedulePickup returns a deterministic pickup id on the offline path', async () => {
      const input: SchedulePickupRequest = {
        pickupPincode: '110001',
        pickupDate: new Date().toISOString(),
        pickupTimeSlot: 'MORNING',
        shipmentIds: ['SHP-1', 'SHP-2'],
        contactName: 'Test User',
        contactPhone: '9999999999',
      };

      const result = await adapter.schedulePickup(input);

      expect(result.pickupId).toMatch(/^XBE-PICKUP/);
      expect(result.pickupDate).toBe(input.pickupDate);
      expect(result.pickupTimeSlot).toBe('MORNING');
      expect(result.trackingUrl).toBeDefined();
    });

    it('cancelPickup is a no-op (does not throw) when no token is configured', async () => {
      const input: CancelPickupRequest = {
        pickupId: 'XBE-PICKUP-123',
        reason: 'customer_changed_mind',
      };

      await expect(adapter.cancelPickup(input)).resolves.toBeUndefined();
    });
  });

  describe('markCodCollected', () => {
    it('does NOT throw (unlike the Delhivery stub) when no token is configured', async () => {
      const input: MarkCodRequest = {
        awbNumber: 'XBE1234567',
        collectedAmount: 1500,
        collectedAt: new Date().toISOString(),
        reference: 'manual-cod-1',
      };

      // Delhivery throws "not yet implemented"; Xpressbees has a real endpoint
      // and falls through to a no-op when the token is absent.
      await expect(adapter.markCodCollected(input)).resolves.toBeUndefined();
    });
  });

  describe('getNdrActions', () => {
    it('returns the canonical action codes for Xpressbees native codes', async () => {
      const shipmentId = 'XBE1234567';

      const actions: NdrActionOption[] = await adapter.getNdrActions(shipmentId);

      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBeGreaterThanOrEqual(3);

      const codes = actions.map((a) => a.code).sort();
      expect(codes).toContain('REATTEMPT');
      expect(codes).toContain('CHANGE_ADDRESS');
      expect(codes).toContain('CANCEL');

      // Map verification: RE_ATTEMPT → REATTEMPT, ADDRESS_CHANGE → CHANGE_ADDRESS, CANCEL → CANCEL
      const reattempt = actions.find((a) => a.code === 'REATTEMPT');
      const addressChange = actions.find((a) => a.code === 'CHANGE_ADDRESS');
      const cancel = actions.find((a) => a.code === 'CANCEL');

      expect(reattempt).toBeDefined();
      expect(reattempt!.requiresCustomerInput).toBe(false);

      expect(addressChange).toBeDefined();
      expect(addressChange!.requiresCustomerInput).toBe(true);

      expect(cancel).toBeDefined();
      expect(cancel!.requiresCustomerInput).toBe(false);

      // Each option must have a label
      for (const action of actions) {
        expect(action.label).toBeTruthy();
      }
    });
  });
});
