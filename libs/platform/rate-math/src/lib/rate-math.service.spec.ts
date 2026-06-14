import { ConfigService } from '@nestjs/config';
import { RateQuote, RateQuoteRequest } from '@swiftship/platform-carriers';
import { RateMathService } from './rate-math.service';
import { WeightBreakService } from './weight-break.service';
import { FuelSurchargeService } from './fuel-surcharge.service';
import { CodSurchargeService } from './cod-surcharge.service';
import { OdaSurchargeService } from './oda-surcharge.service';

const makeQuote = (overrides: Partial<RateQuote> = {}): RateQuote => ({
  carrier: 'Delhivery',
  carrierCode: 'DELHIVERY',
  serviceType: 'STANDARD',
  rate: 9900, // base = ₹99 = 9900 paise
  currency: 'INR',
  estimatedDays: { min: 3, max: 5 },
  codAvailable: true,
  pickupAvailable: true,
  expiresAt: new Date(),
  ...overrides,
});

const makeReq = (overrides: Partial<RateQuoteRequest> = {}): RateQuoteRequest => ({
  originPincode: '110001',
  destinationPincode: '560001',
  weightGrams: 500,
  paymentMethod: 'PREPAID',
  ...overrides,
});

describe('RateMathService', () => {
  let service: RateMathService;
  let oda: jest.Mocked<OdaSurchargeService>;

  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;

  beforeEach(() => {
    oda = {
      compute: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<OdaSurchargeService>;

    service = new RateMathService(
      config,
      new WeightBreakService(),
      new FuelSurchargeService({ get: jest.fn() } as unknown as ConfigService),
      new CodSurchargeService({ get: jest.fn() } as unknown as ConfigService),
      oda,
    );
  });

  it('applies fuel + GST to a PREPAID quote with no ODA (no COD, no weight break)', async () => {
    const result = await service.applySurcharges(
      makeQuote({ rate: 9900 }),
      makeReq({ weightGrams: 500 }), // 500g on a 500g slab -> no weight break
    );
    const breakdown = result.metadata?.breakdown;
    expect(breakdown).toBeDefined();
    const bd = breakdown as { baseRate: number; fuelSurcharge: number; codSurcharge: number; odaSurcharge: number; gst: number; total: number; billableWeightGrams: number };
    expect(bd.baseRate).toEqual(9900);
    expect(bd.fuelSurcharge).toEqual(Math.round(9900 * 0.18));
    expect(bd.codSurcharge).toEqual(0);
    expect(bd.odaSurcharge).toEqual(0);
    const preTax = 9900 + Math.round(9900 * 0.18);
    const ok = Math.round(preTax * 0.18);
    expect(bd.gst).toEqual(ok);
    expect(result.rate).toEqual(preTax + bd.gst);
  });

  it('adds the COD surcharge (default ₹50) when paymentMethod is COD', async () => {
    const result = await service.applySurcharges(
      makeQuote({ rate: 9900 }),
      makeReq({ paymentMethod: 'COD', codAmount: 100000 }),
    );
    const bd = result.metadata?.breakdown as { codSurcharge: number };
    expect(bd.codSurcharge).toEqual(5000); // 5000 paise = ₹50 default
  });

  it('adds the ODA surcharge when oda.compute() returns 100', async () => {
    oda.compute.mockResolvedValueOnce(100);
    const result = await service.applySurcharges(
      makeQuote({ rate: 9900 }),
      makeReq(),
    );
    const bd = result.metadata?.breakdown as { odaSurcharge: number };
    expect(bd.odaSurcharge).toEqual(100);
  });

  it('does not add the COD surcharge when paymentMethod is PREPAID', async () => {
    const result = await service.applySurcharges(
      makeQuote({ rate: 9900 }),
      makeReq({ paymentMethod: 'PREPAID', codAmount: 100000 }),
    );
    const bd = result.metadata?.breakdown as { codSurcharge: number };
    expect(bd.codSurcharge).toEqual(0);
  });

  it('applies the weight break (450g → 500g slab), pro-rating the base rate', async () => {
    // base rate is for 500g; actual shipment is 450g, slab 500g
    // billable weight = 500g, so adjusted base = 9900 * (500/450) ≈ 11000
    const result = await service.applySurcharges(
      makeQuote({ rate: 9900 }),
      makeReq({ weightGrams: 450 }),
    );
    const bd = result.metadata?.breakdown as { billableWeightGrams: number; baseRate: number };
    expect(bd.billableWeightGrams).toEqual(500);
    const ok = Math.round(9900 * (500 / 450));
    expect(bd.baseRate).toEqual(ok);
  });

  it('does not change the base rate when weight is on the slab boundary', async () => {
    const result = await service.applySurcharges(
      makeQuote({ rate: 9900 }),
      makeReq({ weightGrams: 1000 }),
    );
    const bd = result.metadata?.breakdown as { baseRate: number; billableWeightGrams: number };
    expect(bd.billableWeightGrams).toEqual(1000);
    expect(bd.baseRate).toEqual(9900);
  });

  it('end-to-end: PREPAID + non-ODA + on-boundary weight = base + fuel + GST only', async () => {
    const result = await service.applySurcharges(
      makeQuote({ rate: 10000 }),
      makeReq({ weightGrams: 500 }),
    );
    const fuel = Math.round(10000 * 0.18);
    const preTax = 10000 + fuel;
    const gst = Math.round(preTax * 0.18);
    const ok = preTax + gst;
    expect(result.rate).toEqual(ok);
  });

  it('end-to-end: COD + non-ODA + weight break = base + fuel + COD + GST', async () => {
    const result = await service.applySurcharges(
      makeQuote({ rate: 10000 }),
      makeReq({ weightGrams: 450, paymentMethod: 'COD', codAmount: 200000 }),
    );
    const adjustedBase = Math.round(10000 * (500 / 450));
    const fuel = Math.round(adjustedBase * 0.18);
    const cod = 5000;
    const preTax = adjustedBase + fuel + cod;
    const gst = Math.round(preTax * 0.18);
    const ok = preTax + gst;
    expect(result.rate).toEqual(ok);
  });

  it('end-to-end: PREPAID + ODA + on-boundary weight = base + fuel + ODA + GST', async () => {
    oda.compute.mockResolvedValueOnce(100);
    const result = await service.applySurcharges(
      makeQuote({ rate: 10000 }),
      makeReq({ weightGrams: 1000 }),
    );
    const fuel = Math.round(10000 * 0.18);
    const preTax = 10000 + fuel + 100;
    const gst = Math.round(preTax * 0.18);
    const ok = preTax + gst;
    expect(result.rate).toEqual(ok);
  });

  it('preserves the original quote metadata fields (e.g. serviceType, estimatedDays)', async () => {
    const result = await service.applySurcharges(
      makeQuote({
        rate: 9900,
        serviceType: 'EXPRESS',
        estimatedDays: { min: 1, max: 2 },
      }),
      makeReq(),
    );
    expect(result.serviceType).toEqual('EXPRESS');
    expect(result.estimatedDays).toEqual({ min: 1, max: 2 });
  });
});
