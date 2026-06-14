import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrdersService } from './orders.service';
import { OrderRateQuoteService } from './order-rate-quote.service';
import { TenantContext } from '@swiftship/domains-tenants';
import { RateRankingService, type RankedRateQuote } from '@swiftship/domains-rate-shop';
import { CreateOrderInput } from './dto/create-order.input';

/**
 * SS-015 — `OrdersService.createOrder` auto-pick tests.
 *
 * The repository backing each entity is stubbed with jest.fn()s. We focus
 * the suite on the auto-pick code path:
 *   - rankRate=false → behaves as today (uses merchant carrierId)
 *   - rankRate=true  → calls RateRankingService.rank and picks the winner
 *   - empty ranked list → throws BadRequestException
 *   - unknown carrier code → throws BadRequestException
 *   - persists the ranked quotes via OrderRateQuoteService
 */
describe('OrdersService', () => {
  let service: OrdersService;
  let rateRanking: jest.Mocked<RateRankingService>;
  let orderRateQuoteService: { recordRankedQuotes: jest.Mock };

  const users = {
    findOne: jest.fn(),
  };
  const carriers = {
    findOne: jest.fn(),
  };
  const warehouses = {
    findOne: jest.fn(),
  };
  const coverage = {
    findOne: jest.fn(),
  };
  const orders = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };

  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue(1),
  };

  const mkRanked = (overrides: Partial<RankedRateQuote> & { carrierCode: string }): RankedRateQuote => ({
    carrier: overrides.carrierCode,
    carrierCode: overrides.carrierCode,
    serviceType: overrides.serviceType ?? 'STANDARD',
    rate: overrides.rate ?? 9900,
    currency: 'INR',
    estimatedDays: overrides.estimatedDays ?? { min: 2, max: 4 },
    codAvailable: true,
    pickupAvailable: true,
    expiresAt: new Date('2026-06-15T00:00:00Z'),
    ranking: overrides.ranking ?? {
      position: 1, score: 0.9, costRank: 1, slaRank: 1, reliabilityRank: 1,
      effectiveCostPaise: 9900, expectedRtoLossPaise: 0, courierScore: 85,
      reasonWhyNotFirst: 'Best match for your strategy',
    },
  });

  // Sensible defaults the resolveWarehouse + carrier + user mocks return.
  const baseInput: CreateOrderInput = {
    orderNumber: 'ORD-001',
    total: 1500,
    userId: 5,
    destinationPincode: '560001',
    packageWeightGrams: 500,
    destinationName: 'Customer',
    destinationPhone: '9999999999',
    destinationAddressLine1: 'A1',
    destinationCity: 'BLR',
    destinationState: 'KA',
  };

  const mkUser = (id: number) => ({ id, tenantId: 1 });
  const mkCarrier = (id: number, name: string) => ({ id, name, tenantId: 1 });
  const mkWarehouse = (id: number) => ({ id, pincode: '110001', isActive: true, tenantId: 1 });

  beforeEach(async () => {
    jest.clearAllMocks();
    orderRateQuoteService = { recordRankedQuotes: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: 'OrderEntityRepository', useValue: orders },
        { provide: 'UserEntityRepository', useValue: users },
        { provide: 'CarrierEntityRepository', useValue: carriers },
        { provide: 'WarehouseEntityRepository', useValue: warehouses },
        { provide: 'WarehouseCoverageEntityRepository', useValue: coverage },
        { provide: DataSource, useValue: dataSource },
        { provide: TenantContext, useValue: tenantContext },
        { provide: RateRankingService, useValue: { rank: jest.fn() } },
        { provide: OrderRateQuoteService, useValue: orderRateQuoteService },
      ],
    }).compile();

    service = module.get(OrdersService);
    rateRanking = module.get(RateRankingService) as jest.Mocked<RateRankingService>;

    // Wire the in-test repository stubs into the service instance.
    (service as any).orders = orders;
    (service as any).users = users;
    (service as any).carriers = carriers;
    (service as any).warehouses = warehouses;
    (service as any).coverage = coverage;
    (service as any).dataSource = dataSource;
    (service as any).tenantContext = tenantContext;
    (service as any).rateRanking = rateRanking;
    (service as any).orderRateQuoteService = orderRateQuoteService;

    // Default mock returns: user exists, coverage resolves to warehouse 1,
    // no specific warehouse requested, no merchant-supplied carrier.
    users.findOne.mockResolvedValue(mkUser(5));
    coverage.findOne.mockResolvedValue({ warehouseId: 1, pincode: '560001' });
    warehouses.findOne.mockResolvedValue(mkWarehouse(1));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // rankRate=false (legacy / explicit opt-out)
  // -------------------------------------------------------------------------

  it('rankRate=false uses the merchant-supplied carrierId and skips the ranker', async () => {
    carriers.findOne.mockResolvedValueOnce(mkCarrier(5, 'DELHIVERY'));
    const saved = { id: 1, carrierId: 5, tenantId: 1 };
    orders.create.mockReturnValue(saved);
    orders.save.mockResolvedValue(saved);
    // getOrder is called after save
    orders.findOne.mockResolvedValueOnce({ id: 1, carrierId: 5 });

    const result = await service.createOrder({
      ...baseInput,
      rankRate: false,
      carrierId: 5,
    });

    expect(rateRanking.rank).not.toHaveBeenCalled();
    expect(carriers.findOne).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ carrierId: 5 }),
    );
    expect(orderRateQuoteService.recordRankedQuotes).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('rankRate=false with no carrierId saves order with carrierId=null', async () => {
    const saved = { id: 1, carrierId: null, tenantId: 1 };
    orders.create.mockReturnValue(saved);
    orders.save.mockResolvedValue(saved);
    orders.findOne.mockResolvedValueOnce({ id: 1, carrierId: null });

    await service.createOrder({
      ...baseInput,
      rankRate: false,
    });

    expect(rateRanking.rank).not.toHaveBeenCalled();
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ carrierId: undefined }),
    );
    expect(orderRateQuoteService.recordRankedQuotes).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // rankRate=true (default — the new auto-pick behavior)
  // -------------------------------------------------------------------------

  it('rankRate=true (default) calls RateRankingService.rank and sets carrierId to the winner', async () => {
    const ranked = [
      mkRanked({ carrierCode: 'WIN' }),
      mkRanked({ carrierCode: 'RUNNER', ranking: { position: 2, score: 0.5, costRank: 2, slaRank: 1, reliabilityRank: 2, effectiveCostPaise: 14900, expectedRtoLossPaise: 0, courierScore: 95, reasonWhyNotFirst: '₹50 more' } }),
    ];
    rateRanking.rank.mockResolvedValueOnce(ranked);
    carriers.findOne.mockResolvedValueOnce(mkCarrier(7, 'WIN'));
    const saved = { id: 99, carrierId: 7, tenantId: 1 };
    orders.create.mockReturnValue(saved);
    orders.save.mockResolvedValue(saved);
    orders.findOne.mockResolvedValueOnce({ id: 99, carrierId: 7 });

    const result = await service.createOrder({
      ...baseInput,
      // rankRate omitted — should default to true
    });

    expect(rateRanking.rank).toHaveBeenCalledTimes(1);
    const [reqArg, prefsArg] = rateRanking.rank.mock.calls[0];
    expect(reqArg).toMatchObject({
      destinationPincode: '560001',
      weightGrams: 500,
      paymentMethod: 'PREPAID',
    });
    expect(typeof reqArg.originPincode).toBe('string');
    expect(reqArg.originPincode.length).toBeGreaterThan(0);
    expect(prefsArg.strategy).toBe('best_value');
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ carrierId: 7 }),
    );
    expect(result).toBeDefined();
  });

  it('rankRate=true passes through the rateStrategy override', async () => {
    const ranked = [mkRanked({ carrierCode: 'FAST' })];
    rateRanking.rank.mockResolvedValueOnce(ranked);
    carriers.findOne.mockResolvedValueOnce(mkCarrier(7, 'FAST'));
    orders.create.mockReturnValue({ id: 1, carrierId: 7 });
    orders.save.mockResolvedValue({ id: 1, carrierId: 7 });
    orders.findOne.mockResolvedValueOnce({ id: 1, carrierId: 7 });

    await service.createOrder({
      ...baseInput,
      rankRate: true,
      rateStrategy: 'fastest' as any,
    });

    const [, prefsArg] = rateRanking.rank.mock.calls[0];
    expect(prefsArg.strategy).toBe('fastest');
  });

  it('rankRate=true persists the ranked quotes via OrderRateQuoteService', async () => {
    const ranked = [
      mkRanked({ carrierCode: 'WIN' }),
      mkRanked({ carrierCode: 'RUNNER', ranking: { position: 2, score: 0.5, costRank: 2, slaRank: 1, reliabilityRank: 2, effectiveCostPaise: 14900, expectedRtoLossPaise: 0, courierScore: 95, reasonWhyNotFirst: '₹50 more' } }),
    ];
    rateRanking.rank.mockResolvedValueOnce(ranked);
    carriers.findOne.mockResolvedValueOnce(mkCarrier(7, 'WIN'));
    const saved = { id: 42, carrierId: 7, tenantId: 1 };
    orders.create.mockReturnValue(saved);
    orders.save.mockResolvedValue(saved);
    orders.findOne.mockResolvedValueOnce({ id: 42, carrierId: 7 });

    await service.createOrder({ ...baseInput });

    expect(orderRateQuoteService.recordRankedQuotes).toHaveBeenCalledWith(
      42,
      ranked,
    );
  });

  it('rankRate=true throws BadRequestException when rateRanking.rank returns 0 quotes', async () => {
    rateRanking.rank.mockResolvedValueOnce([]);

    await expect(service.createOrder({ ...baseInput })).rejects.toThrow(
      BadRequestException,
    );
    expect(orderRateQuoteService.recordRankedQuotes).not.toHaveBeenCalled();
  });

  it('rankRate=true throws BadRequestException when the winner is not connected for the tenant', async () => {
    const ranked = [mkRanked({ carrierCode: 'GHOST_CARRIER' })];
    rateRanking.rank.mockResolvedValueOnce(ranked);
    carriers.findOne.mockResolvedValueOnce(null); // no row in carriers

    await expect(service.createOrder({ ...baseInput })).rejects.toThrow(
      BadRequestException,
    );
    expect(orderRateQuoteService.recordRankedQuotes).not.toHaveBeenCalled();
  });

  it('rankRate=true throws BadRequestException when the ranker throws', async () => {
    rateRanking.rank.mockRejectedValueOnce(new Error('all carriers OPEN'));

    await expect(service.createOrder({ ...baseInput })).rejects.toThrow(
      BadRequestException,
    );
    // No silent fallback — the order is NOT saved.
    expect(orders.save).not.toHaveBeenCalled();
  });
});
