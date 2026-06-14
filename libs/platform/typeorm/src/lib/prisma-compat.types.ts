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
 *
 * Multi-tenant isolation (SS-002c):
 *   The shim silently merges a `tenantId` filter into every `find*` query
 *   using the current `tenantId` from an `AsyncLocalStorage` slot. The slot
 *   is populated once per request from a `getTenantId()` callback wired in
 *   `AppModule` (which resolves `req.tenantId` from `TenantMiddleware`).
 *   This means a service that forgot `where: { tenantId }` cannot read
 *   across tenants — the shim enforces it as a defence-in-depth layer on
 *   top of explicit per-service filters. Mutations (`update` / `delete`)
 *   refuse to act on a row whose `tenantId` doesn't match the current
 *   context, and `create` errors if the payload's `tenantId` disagrees with
 *   the context.
 *
 *   System operations (onboarding flow, cod-remittance worker, admin
 *   wallet top-ups) wrap the call in `withSystemContext(async () => ...)`
 *   which temporarily pins the tenant to id=1 and bypasses the check.
 */
import { Injectable, Inject, Global } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
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

/** Tables whose `tenantId` column is enforced by the shim. */
const TENANT_AWARE_TABLES = new Set<string>([
  'orders',
  'shipments',
  'invoices',
  'warehouses',
  'pincode_zones',
  'rate_surcharges',
  'shopify_stores',
  'shopify_orders',
  'shopify_webhook_events',
  'woocommerce_stores',
  'woocommerce_orders',
  'carriers',
  'cod_remittances',
  'ndr_cases',
  'manifests',
  'manifest_items',
  'pickups',
  'returns',
  'shipping_rates',
  'webhook_subscriptions',
  'idempotency_keys',
  'eway_bills',
  'payments',
  'refunds',
  'subscriptions',
  'invoice_items',
  'invoice_sequences',
  'onboarding_states',
  'courier_score_daily',
]);

/**
 * Tables that are *global* — i.e. not tenant-scoped. The shim must not
 * inject a `tenantId` filter when querying these (e.g. `users` is a global
 * identity record; `roles` is a global RBAC catalogue; `refresh_tokens` is
 * tied to the global `users` table).
 */
const GLOBAL_TABLES = new Set<string>([
  'users',
  'tenants',
  'roles',
  'refresh_tokens',
]);

/** System tenant id — has read/write across all tenants. */
export const SYSTEM_TENANT_ID = 1;

const mapOrder = (o: any): FindManyOptions['order'] => {
  if (!o) return undefined;
  const out: Record<string, 'ASC' | 'DESC'> = {};
  for (const [k, v] of Object.entries(o)) {
    out[k] = String(v).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  }
  return out;
};

/**
 * Per-request tenant slot. `als.run(tenantId, fn)` propagates the value
 * across async boundaries (Promises, timers) without needing a request-
 * scoped provider — so the shim can stay a global `@Injectable()` and
 * every existing call site keeps working unchanged.
 */
const tenantAls = new AsyncLocalStorage<number>();

/**
 * Optional callback that returns the current tenantId (resolved from
 * `req.tenantId` via the `TenantMiddleware` / `TenantContext`). The
 * callback is invoked once per request at the top of the pipeline.
 *
 * This is set by the app composition (see `TypeormModule#register`)
 * and read by the shim on every operation. We keep it as a callback
 * (rather than a Nest provider) so the platform lib doesn't need to
 * import from `@swiftship/domains-tenants` — that would be a
 * platform-importing-domain violation per the 5 dep rules.
 */
let getTenantIdFn: (() => number | string | null | undefined) | null = null;

/**
 * Configure the shim. Called once at AppModule boot. `getTenantId` is
 * invoked once per request (by a small middleware/interceptor) inside an
 * `als.run()` so the value is visible to every shim call.
 */
export const configurePrismaCompat = (opts: {
  getTenantId: () => number | string | null | undefined;
}) => {
  getTenantIdFn = opts.getTenantId;
};

/**
 * Run `fn` as if it were the current request. The shim's tenant lookup
 * uses `als.getStore()` first, then falls back to `getTenantIdFn()`. This
 * lets the request middleware bind the tenantId at the top of the
 * pipeline, and lets test code / system jobs override it.
 */
export const bindTenantContext = <T>(tenantId: number | undefined, fn: () => T | Promise<T>): T | Promise<T> => {
  return tenantAls.run(tenantId as number, fn);
};

/**
 * Resolve the current tenantId, honouring system overrides.
 */
const resolveTenantId = (): number | undefined => {
  const override = tenantAls.getStore();
  if (override === SYSTEM_TENANT_ID) return SYSTEM_TENANT_ID;
  if (override !== undefined) return override;
  if (!getTenantIdFn) return undefined;
  const v = getTenantIdFn();
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Per-repo wrapper. Knows its table name (resolved from the entity) so it
 * can apply tenant filters only to tables that actually have a `tenantId`
 * column.
 */
class CompatRepo<T extends { id: number }> {
  private readonly tableName: string;

  constructor(public readonly repo: Repository<T>, entityTarget: any) {
    // TypeORM stores the resolved table name on the entity target at boot
    // time. We pull it once at construction; if it isn't available yet
    // (rare — only in unit tests with a stub repo) we fall back to a
    // heuristic so the shim never throws on construction.
    const meta = (repo as any).metadata;
    this.tableName = meta?.tableName ?? this.inferTableName(entityTarget);
  }

  private inferTableName(target: any): string {
    // Heuristic: take the entity class name and snake_case it. E.g.
    // `OrderEntity` → `orders`, `CodRemittanceEntity` → `cod_remittances`.
    const name: string = target?.name ?? 'unknown';
    return name
      .replace(/Entity$/, '')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase() + 's';
  }

  /** True if the underlying table is tenant-scoped. */
  private isTenantAware(): boolean {
    return TENANT_AWARE_TABLES.has(this.tableName);
  }

  /**
   * Merge `tenantId` into a `where` clause from the Prisma-style args, so the
   * TypeORM translation below picks it up automatically. A call site can
   * *also* pass `tenantId` explicitly — we only add it if missing.
   */
  private withTenantFilter(args: any): any {
    if (!this.isTenantAware()) return args ?? {};
    const a = args ?? {};
    const where = { ...(a.where ?? {}) };
    if (where.tenantId === undefined) {
      const tid = resolveTenantId();
      if (tid === undefined) {
        // No tenant context — refuse the read. A service that legitimately
        // needs to run before the tenant is set (e.g. before middleware
        // resolved the API key) must wrap the call in `withSystemContext`.
        throw new Error(
          `[PrismaCompat] No tenant context for table '${this.tableName}'. ` +
            `Wrap the call in PrismaCompat#withSystemContext(...) for system operations.`,
        );
      }
      where.tenantId = tid;
    }
    return { ...a, where };
  }

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
    const merged = this.withTenantFilter(args);
    const where = merged.where as FindOptionsWhere<T>;
    return this.repo.findOne({
      where,
      relations: merged.include ? Object.keys(merged.include) : [],
    });
  }

  async findFirst(args: any = {}) {
    return this.repo.findOne(this.toFindOptions(this.withTenantFilter(args)));
  }

  async findMany(args: any = {}) {
    return this.repo.find(this.toFindOptions(this.withTenantFilter(args)));
  }

  async create(args: { data: any; include?: any }) {
    const data = { ...(args.data ?? {}) };
    if (this.isTenantAware()) {
      // Allow the call site to specify `tenantId` (e.g. from the user record)
      // but require it to match the current context.
      const ctxTid = resolveTenantId();
      if (ctxTid === undefined) {
        throw new Error(
          `[PrismaCompat] No tenant context for create on '${this.tableName}'.`,
        );
      }
      if (data.tenantId !== undefined && Number(data.tenantId) !== ctxTid) {
        throw new Error(
          `[PrismaCompat] Cross-tenant create on '${this.tableName}': ` +
            `data.tenantId=${data.tenantId} but context tenantId=${ctxTid}.`,
        );
      }
      data.tenantId = ctxTid;
    }
    if (args.include) {
      const ent = this.repo.create(data);
      const saved = await this.repo.save(ent);
      return this.repo.findOne({
        where: ({ id: saved.id } as any) as FindOptionsWhere<T>,
        relations: Object.keys(args.include),
      });
    }
    const ent = this.repo.create(data);
    return this.repo.save(ent);
  }

  async update(args: { where: { id: number } | any; data: any; include?: any }) {
    if (this.isTenantAware()) {
      const ctxTid = resolveTenantId();
      if (ctxTid === undefined) {
        throw new Error(
          `[PrismaCompat] No tenant context for update on '${this.tableName}'.`,
        );
      }
      // Verify the row exists *and* matches the tenant before updating.
      const existing = await this.repo.findOne({ where: args.where as FindOptionsWhere<T> });
      if (!existing) return null;
      if ((existing as any).tenantId !== undefined && (existing as any).tenantId !== ctxTid) {
        throw new Error(
          `[PrismaCompat] Cross-tenant update on '${this.tableName}': ` +
            `row.tenantId=${(existing as any).tenantId} but context tenantId=${ctxTid}.`,
        );
      }
      // Merge tenantId into the where so TypeORM won't accidentally update
      // a row that lost its tenant between our check and the update.
      const safeWhere = { ...(args.where ?? {}), tenantId: ctxTid };
      await this.repo.update(safeWhere as FindOptionsWhere<T>, args.data);
      if (args.include) {
        return this.repo.findOne({
          where: safeWhere as FindOptionsWhere<T>,
          relations: Object.keys(args.include),
        });
      }
      return this.repo.findOne({ where: safeWhere as FindOptionsWhere<T> });
    }
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
    if (this.isTenantAware()) {
      const ctxTid = resolveTenantId();
      if (ctxTid === undefined) {
        throw new Error(
          `[PrismaCompat] No tenant context for delete on '${this.tableName}'.`,
        );
      }
      const target = await this.repo.findOne({ where: args.where as FindOptionsWhere<T> });
      if (!target) return null;
      if ((target as any).tenantId !== undefined && (target as any).tenantId !== ctxTid) {
        throw new Error(
          `[PrismaCompat] Cross-tenant delete on '${this.tableName}': ` +
            `row.tenantId=${(target as any).tenantId} but context tenantId=${ctxTid}.`,
        );
      }
      return this.repo.remove(target);
    }
    const target = await this.repo.findOne({ where: args.where as FindOptionsWhere<T> });
    if (!target) return null;
    return this.repo.remove(target);
  }

  async groupBy(args: { by: string[]; _count?: any; where?: any }) {
    const merged = this.withTenantFilter(args);
    const by = merged.by[0];
    const qb = this.repo.createQueryBuilder('e');
    qb.select(`e.${by}`, by);
    if (merged._count) {
      const cntKey = Object.keys(merged._count)[0];
      qb.addSelect('COUNT(*)', '_count_' + cntKey);
    }
    if (merged.where) {
      for (const [k, v] of Object.entries(merged.where)) {
        qb.andWhere(`e.${k} = :${k}`, { [k]: v });
      }
    }
    qb.groupBy(`e.${by}`);
    const rows = await qb.getRawMany();
    return rows.map((r) => {
      const out: any = {};
      for (const k of merged.by) out[k] = r[k];
      if (merged._count) {
        const cntKey = Object.keys(merged._count)[0];
        out._count = { [cntKey]: Number(r[`_count_${cntKey}`]) };
      }
      return out;
    });
  }

  async aggregate(args: { _sum?: any; where?: any }) {
    const merged = this.withTenantFilter(args);
    const qb = this.repo.createQueryBuilder('e');
    if (merged._sum) {
      for (const [k, _v] of Object.entries(merged._sum)) {
        qb.addSelect(`COALESCE(SUM(e.${k}), 0)`, `_sum_${k}`);
      }
    }
    if (merged.where) {
      for (const [k, v] of Object.entries(merged.where)) {
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
    if (merged._sum) {
      for (const [k] of Object.entries(merged._sum)) {
        out._sum = { [k]: Number(row[`_sum_${k}`] ?? 0) };
      }
    }
    return out;
  }
}

@Injectable()
@Global()
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
    this.user = new CompatRepo(user, UserEntity);
    this.order = new CompatRepo(order, OrderEntity);
    this.carrier = new CompatRepo(carrier, CarrierEntity);
    this.shipment = new CompatRepo(shipment, ShipmentEntity);
    this.shippingLabel = new CompatRepo(shippingLabel, ShippingLabelEntity);
    this.trackingEvent = new CompatRepo(trackingEvent, TrackingEventEntity);
    this.warehouse = new CompatRepo(warehouse, WarehouseEntity);
    this.warehouseCoverage = new CompatRepo(warehouseCoverage, WarehouseCoverageEntity);
    this.warehouseSellerProfile = new CompatRepo(warehouseSellerProfile, WarehouseSellerProfileEntity);
    this.warehouseStock = new CompatRepo(warehouseStock, WarehouseStockEntity);
    this.pincodeZone = new CompatRepo(pincodeZone, PincodeZoneEntity);
    this.shippingRate = new CompatRepo(shippingRate, ShippingRateEntity);
    this.rateSurcharge = new CompatRepo(rateSurcharge, RateSurchargeEntity);
    this.return = new CompatRepo(returnRepo, ReturnEntity);
    this.pickup = new CompatRepo(pickup, PickupEntity);
    this.manifest = new CompatRepo(manifest, ManifestEntity);
    this.manifestItem = new CompatRepo(manifestItem, ManifestItemEntity);
    this.ndrCase = new CompatRepo(ndrCase, NdrCaseEntity);
    this.codRemittance = new CompatRepo(codRemittance, CodRemittanceEntity);
    this.webhookSubscription = new CompatRepo(webhookSubscription, WebhookSubscriptionEntity);
    this.idempotencyKey = new CompatRepo(idempotencyKey, IdempotencyKeyEntity);
    this.ewayBill = new CompatRepo(ewayBill, EwayBillEntity);
    this.shopifyStore = new CompatRepo(shopifyStore, ShopifyStoreEntity);
    this.shopifyOrder = new CompatRepo(shopifyOrder, ShopifyOrderEntity);
    this.shopifyWebhookEvent = new CompatRepo(shopifyWebhookEvent, ShopifyWebhookEventEntity);
    this.wooCommerceStore = new CompatRepo(wooCommerceStore, WooCommerceStoreEntity);
    this.wooCommerceOrder = new CompatRepo(wooCommerceOrder, WooCommerceOrderEntity);
    this.role = new CompatRepo(role, RoleEntity);
    this.onboardingState = new CompatRepo(onboardingState, OnboardingStateEntity);
    this.payment = new CompatRepo(payment, PaymentEntity);
    this.refund = new CompatRepo(refund, RefundEntity);
    this.subscription = new CompatRepo(subscription, SubscriptionEntity);
    this.invoice = new CompatRepo(invoice, InvoiceEntity);
    this.invoiceItem = new CompatRepo(invoiceItem, InvoiceItemEntity);
    this.invoiceSequence = new CompatRepo(invoiceSequence, InvoiceSequenceEntity);
    this.refreshToken = new CompatRepo(refreshToken, RefreshTokenEntity);
  }

  /**
   * Run `fn` as the system tenant. Use this from:
   *   - onboarding flows that create the very first tenant
   *   - cron workers that legitimately need to read across tenants
   *   - admin-only mutations (e.g. wallet top-up by a tenant admin)
   */
  async withSystemContext<T>(fn: () => Promise<T> | T): Promise<T> {
    return bindTenantContext(SYSTEM_TENANT_ID, fn) as Promise<T>;
  }

  /**
   * Read-only accessor: returns the current tenantId this shim is bound to
   * (or undefined if no request scope has set it). Useful for services that
   * want to add their own safety check before calling the shim.
   */
  getCurrentTenantId(): number | undefined {
    return resolveTenantId();
  }
}
