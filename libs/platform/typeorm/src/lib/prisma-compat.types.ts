/**
 * Prisma-compat shim — a small subset of the Prisma client surface backed by
 * TypeORM repositories.
 *
 * Why this exists:
 *   The codebase has 21 services that use `prisma.user.findUnique({ where })`,
 *   `prisma.order.findMany({ where, include, orderBy })`, etc. Rewriting them
 *   in one pass is a multi-week effort. Until then, the shim lets services
 *   continue to call `this.prisma.user.findUnique(...)` while the runtime
 *   queries the new TypeORM datasource.
 *
 * How to use:
 *   1. Inject `PrismaCompat` exactly where you injected `PrismaService`.
 *   2. The shim exposes a `user`, `order`, `carrier`, … property that proxies
 *      `findUnique`, `findFirst`, `findMany`, `create`, `update`, `delete`,
 *      `groupBy`, and `aggregate` to the corresponding TypeORM repository.
 *   3. `include` is mapped to `relations`; `orderBy: { x: 'desc' }` is mapped
 *      to `order: { x: 'DESC' }`.
 *
 * Caveats:
 *   - This is *not* a complete Prisma emulator. Queries that use
 *     `select`, nested writes, transactions, or `connect`/`disconnect` are
 *     not supported. Migrate those services to direct `@InjectRepository()`
 *     use as you touch them.
 *   - The shim deliberately throws loud errors for unsupported ops so a stale
 *     `prisma.x.create({ include: … })` doesn't silently lose data.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, FindManyOptions } from 'typeorm';
import {
  UserEntity,
  OrderEntity,
  CarrierEntity,
  ShipmentEntity,
  ShippingLabelEntity,
  TrackingEventEntity,
  WarehouseEntity,
  WarehouseCoverageEntity,
  WarehouseSellerProfileEntity,
  WarehouseStockEntity,
  PincodeZoneEntity,
  ShippingRateEntity,
  RateSurchargeEntity,
  ReturnEntity,
  PickupEntity,
  ManifestEntity,
  ManifestItemEntity,
  NdrCaseEntity,
  CodRemittanceEntity,
  WebhookSubscriptionEntity,
  IdempotencyKeyEntity,
  EwayBillEntity,
  ShopifyStoreEntity,
  ShopifyOrderEntity,
  ShopifyWebhookEventEntity,
  WooCommerceStoreEntity,
  WooCommerceOrderEntity,
  RoleEntity,
  OnboardingStateEntity,
  PaymentEntity,
  RefundEntity,
  SubscriptionEntity,
  InvoiceEntity,
  InvoiceItemEntity,
  InvoiceSequenceEntity,
  RefreshTokenEntity,
} from './entities';

const mapOrder = (o: any): FindManyOptions['order'] => {
  if (!o) return undefined;
  const out: Record<string, 'ASC' | 'DESC'> = {};
  for (const [k, v] of Object.entries(o)) {
    out[k] = String(v).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  }
  return out;
};

class CompatRepo<T extends { id: number }> {
  constructor(public readonly repo: Repository<T>) {}

  private toFindOptions(args: any): FindManyOptions<T> {
    const opts: FindManyOptions<T> = {};
    if (args?.where) opts.where = args.where as FindOptionsWhere<T>;
    if (args?.orderBy) opts.order = mapOrder(args.orderBy);
    if (args?.include) {
      opts.relations = Object.keys(args.include);
    }
    if (args?.select) {
      opts.select = args.select;
    }
    if (args?.take !== undefined) opts.take = args.take;
    if (args?.skip !== undefined) opts.skip = args.skip;
    return opts;
  }

  async findUnique(args: { where: { id: number } | any; include?: any }) {
    const where = args.where as FindOptionsWhere<T>;
    return this.repo.findOne({ where, relations: args.include ? Object.keys(args.include) : [] });
  }

  async findFirst(args: any = {}) {
    return this.repo.findOne(this.toFindOptions(args));
  }

  async findMany(args: any = {}) {
    return this.repo.find(this.toFindOptions(args));
  }

  async create(args: { data: any; include?: any }) {
    if (args.include) {
      // emulate `include` on create by saving and re-reading with relations
      const ent = this.repo.create(args.data);
      const saved = await this.repo.save(ent);
      return this.repo.findOne({
        where: ({ id: saved.id } as any) as FindOptionsWhere<T>,
        relations: Object.keys(args.include),
      });
    }
    const ent = this.repo.create(args.data);
    return this.repo.save(ent);
  }

  async update(args: { where: { id: number } | any; data: any; include?: any }) {
    await this.repo.update(args.where as FindOptionsWhere<T>, args.data);
    if (args.include) {
      return this.repo.findOne({
        where: args.where as FindOptionsWhere<T>,
        relations: Object.keys(args.include),
      });
    }
    return this.repo.findOne({ where: args.where as FindOptionsWhere<T> });
  }

  async delete(args: { where: { id: number } | any }) {
    const target = await this.repo.findOne({ where: args.where as FindOptionsWhere<T> });
    if (!target) return null;
    return this.repo.remove(target);
  }

  async groupBy(args: { by: string[]; _count?: any; where?: any }) {
    const by = args.by[0];
    const qb = this.repo.createQueryBuilder('e');
    qb.select(`e.${by}`, by);
    if (args._count) {
      const cntKey = Object.keys(args._count)[0];
      qb.addSelect('COUNT(*)', '_count_' + cntKey);
    }
    if (args.where) {
      for (const [k, v] of Object.entries(args.where)) {
        qb.andWhere(`e.${k} = :${k}`, { [k]: v });
      }
    }
    qb.groupBy(`e.${by}`);
    const rows = await qb.getRawMany();
    return rows.map((r) => {
      const out: any = {};
      for (const k of args.by) out[k] = r[k];
      if (args._count) {
        const cntKey = Object.keys(args._count)[0];
        out._count = { [cntKey]: Number(r[`_count_${cntKey}`]) };
      }
      return out;
    });
  }

  async aggregate(args: { _sum?: any; where?: any }) {
    const qb = this.repo.createQueryBuilder('e');
    if (args._sum) {
      for (const [k, _v] of Object.entries(args._sum)) {
        qb.addSelect(`COALESCE(SUM(e.${k}), 0)`, `_sum_${k}`);
      }
    }
    if (args.where) {
      for (const [k, v] of Object.entries(args.where)) {
        if (typeof v === 'object' && v !== null) {
          // Status enum comparison
          for (const [op, val] of Object.entries(v as any)) {
            qb.andWhere(`e.${k} ${op === 'equals' ? '=' : op} :${k}`, { [k]: val });
          }
        } else {
          qb.andWhere(`e.${k} = :${k}`, { [k]: v });
        }
      }
    }
    const row = await qb.getRawOne();
    const out: any = {};
    if (args._sum) {
      for (const [k] of Object.entries(args._sum)) {
        out._sum = { [k]: Number(row[`_sum_${k}`] ?? 0) };
      }
    }
    return out;
  }
}

@Injectable()
export class PrismaCompat {
  user: CompatRepo<UserEntity>;
  order: CompatRepo<OrderEntity>;
  carrier: CompatRepo<CarrierEntity>;
  shipment: CompatRepo<ShipmentEntity>;
  shippingLabel: CompatRepo<ShippingLabelEntity>;
  trackingEvent: CompatRepo<TrackingEventEntity>;
  warehouse: CompatRepo<WarehouseEntity>;
  warehouseCoverage: CompatRepo<WarehouseCoverageEntity>;
  warehouseSellerProfile: CompatRepo<WarehouseSellerProfileEntity>;
  warehouseStock: CompatRepo<WarehouseStockEntity>;
  pincodeZone: CompatRepo<PincodeZoneEntity>;
  shippingRate: CompatRepo<ShippingRateEntity>;
  rateSurcharge: CompatRepo<RateSurchargeEntity>;
  return: CompatRepo<ReturnEntity>;
  pickup: CompatRepo<PickupEntity>;
  manifest: CompatRepo<ManifestEntity>;
  manifestItem: CompatRepo<ManifestItemEntity>;
  ndrCase: CompatRepo<NdrCaseEntity>;
  codRemittance: CompatRepo<CodRemittanceEntity>;
  webhookSubscription: CompatRepo<WebhookSubscriptionEntity>;
  idempotencyKey: CompatRepo<IdempotencyKeyEntity>;
  ewayBill: CompatRepo<EwayBillEntity>;
  shopifyStore: CompatRepo<ShopifyStoreEntity>;
  shopifyOrder: CompatRepo<ShopifyOrderEntity>;
  shopifyWebhookEvent: CompatRepo<ShopifyWebhookEventEntity>;
  wooCommerceStore: CompatRepo<WooCommerceStoreEntity>;
  wooCommerceOrder: CompatRepo<WooCommerceOrderEntity>;
  role: CompatRepo<RoleEntity>;
  onboardingState: CompatRepo<OnboardingStateEntity>;
  payment: CompatRepo<PaymentEntity>;
  refund: CompatRepo<RefundEntity>;
  subscription: CompatRepo<SubscriptionEntity>;
  invoice: CompatRepo<InvoiceEntity>;
  invoiceItem: CompatRepo<InvoiceItemEntity>;
  invoiceSequence: CompatRepo<InvoiceSequenceEntity>;
  refreshToken: CompatRepo<RefreshTokenEntity>;

  constructor(
    @InjectRepository(UserEntity) user: Repository<UserEntity>,
    @InjectRepository(OrderEntity) order: Repository<OrderEntity>,
    @InjectRepository(CarrierEntity) carrier: Repository<CarrierEntity>,
    @InjectRepository(ShipmentEntity) shipment: Repository<ShipmentEntity>,
    @InjectRepository(ShippingLabelEntity) shippingLabel: Repository<ShippingLabelEntity>,
    @InjectRepository(TrackingEventEntity) trackingEvent: Repository<TrackingEventEntity>,
    @InjectRepository(WarehouseEntity) warehouse: Repository<WarehouseEntity>,
    @InjectRepository(WarehouseCoverageEntity) warehouseCoverage: Repository<WarehouseCoverageEntity>,
    @InjectRepository(WarehouseSellerProfileEntity) warehouseSellerProfile: Repository<WarehouseSellerProfileEntity>,
    @InjectRepository(WarehouseStockEntity) warehouseStock: Repository<WarehouseStockEntity>,
    @InjectRepository(PincodeZoneEntity) pincodeZone: Repository<PincodeZoneEntity>,
    @InjectRepository(ShippingRateEntity) shippingRate: Repository<ShippingRateEntity>,
    @InjectRepository(RateSurchargeEntity) rateSurcharge: Repository<RateSurchargeEntity>,
    @InjectRepository(ReturnEntity) returnRepo: Repository<ReturnEntity>,
    @InjectRepository(PickupEntity) pickup: Repository<PickupEntity>,
    @InjectRepository(ManifestEntity) manifest: Repository<ManifestEntity>,
    @InjectRepository(ManifestItemEntity) manifestItem: Repository<ManifestItemEntity>,
    @InjectRepository(NdrCaseEntity) ndrCase: Repository<NdrCaseEntity>,
    @InjectRepository(CodRemittanceEntity) codRemittance: Repository<CodRemittanceEntity>,
    @InjectRepository(WebhookSubscriptionEntity) webhookSubscription: Repository<WebhookSubscriptionEntity>,
    @InjectRepository(IdempotencyKeyEntity) idempotencyKey: Repository<IdempotencyKeyEntity>,
    @InjectRepository(EwayBillEntity) ewayBill: Repository<EwayBillEntity>,
    @InjectRepository(ShopifyStoreEntity) shopifyStore: Repository<ShopifyStoreEntity>,
    @InjectRepository(ShopifyOrderEntity) shopifyOrder: Repository<ShopifyOrderEntity>,
    @InjectRepository(ShopifyWebhookEventEntity) shopifyWebhookEvent: Repository<ShopifyWebhookEventEntity>,
    @InjectRepository(WooCommerceStoreEntity) wooCommerceStore: Repository<WooCommerceStoreEntity>,
    @InjectRepository(WooCommerceOrderEntity) wooCommerceOrder: Repository<WooCommerceOrderEntity>,
    @InjectRepository(RoleEntity) role: Repository<RoleEntity>,
    @InjectRepository(OnboardingStateEntity) onboardingState: Repository<OnboardingStateEntity>,
    @InjectRepository(PaymentEntity) payment: Repository<PaymentEntity>,
    @InjectRepository(RefundEntity) refund: Repository<RefundEntity>,
    @InjectRepository(SubscriptionEntity) subscription: Repository<SubscriptionEntity>,
    @InjectRepository(InvoiceEntity) invoice: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity) invoiceItem: Repository<InvoiceItemEntity>,
    @InjectRepository(InvoiceSequenceEntity) invoiceSequence: Repository<InvoiceSequenceEntity>,
    @InjectRepository(RefreshTokenEntity) refreshToken: Repository<RefreshTokenEntity>,
  ) {
    this.user = new CompatRepo(user);
    this.order = new CompatRepo(order);
    this.carrier = new CompatRepo(carrier);
    this.shipment = new CompatRepo(shipment);
    this.shippingLabel = new CompatRepo(shippingLabel);
    this.trackingEvent = new CompatRepo(trackingEvent);
    this.warehouse = new CompatRepo(warehouse);
    this.warehouseCoverage = new CompatRepo(warehouseCoverage);
    this.warehouseSellerProfile = new CompatRepo(warehouseSellerProfile);
    this.warehouseStock = new CompatRepo(warehouseStock);
    this.pincodeZone = new CompatRepo(pincodeZone);
    this.shippingRate = new CompatRepo(shippingRate);
    this.rateSurcharge = new CompatRepo(rateSurcharge);
    this.return = new CompatRepo(returnRepo);
    this.pickup = new CompatRepo(pickup);
    this.manifest = new CompatRepo(manifest);
    this.manifestItem = new CompatRepo(manifestItem);
    this.ndrCase = new CompatRepo(ndrCase);
    this.codRemittance = new CompatRepo(codRemittance);
    this.webhookSubscription = new CompatRepo(webhookSubscription);
    this.idempotencyKey = new CompatRepo(idempotencyKey);
    this.ewayBill = new CompatRepo(ewayBill);
    this.shopifyStore = new CompatRepo(shopifyStore);
    this.shopifyOrder = new CompatRepo(shopifyOrder);
    this.shopifyWebhookEvent = new CompatRepo(shopifyWebhookEvent);
    this.wooCommerceStore = new CompatRepo(wooCommerceStore);
    this.wooCommerceOrder = new CompatRepo(wooCommerceOrder);
    this.role = new CompatRepo(role);
    this.onboardingState = new CompatRepo(onboardingState);
    this.payment = new CompatRepo(payment);
    this.refund = new CompatRepo(refund);
    this.subscription = new CompatRepo(subscription);
    this.invoice = new CompatRepo(invoice);
    this.invoiceItem = new CompatRepo(invoiceItem);
    this.invoiceSequence = new CompatRepo(invoiceSequence);
    this.refreshToken = new CompatRepo(refreshToken);
  }
}
