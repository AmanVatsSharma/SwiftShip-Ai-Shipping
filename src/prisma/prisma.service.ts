/**
 * PrismaService (TypeORM-backed shim).
 *
 * The codebase is migrating from Prisma to TypeORM. This file re-exports a
 * shim that exposes a Prisma-like `prisma.user.findUnique({ where })` API
 * backed by TypeORM repositories. See `prisma-compat.types.ts` in
 * libs/platform/typeorm for the full compat matrix.
 *
 * The shim deliberately throws for any unsupported op so a stale
 * `prisma.x.create({ include: … })` doesn't silently lose data.
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaCompat } from '../../libs/platform/typeorm/src/lib/prisma-compat.types';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly compat: PrismaCompat) {}

  async onModuleInit() {
    this.logger.warn(
      'PrismaService is a TypeORM-backed shim. Please migrate services to @InjectRepository from @nestjs/typeorm.',
    );
  }

  async onModuleDestroy() {
    /* noop */
  }

  // Proxy every model through the TypeORM-backed compat shim.
  get user() { return this.compat.user; }
  get order() { return this.compat.order; }
  get carrier() { return this.compat.carrier; }
  get shipment() { return this.compat.shipment; }
  get shippingLabel() { return this.compat.shippingLabel; }
  get trackingEvent() { return this.compat.trackingEvent; }
  get warehouse() { return this.compat.warehouse; }
  get warehouseCoverage() { return this.compat.warehouseCoverage; }
  get warehouseSellerProfile() { return this.compat.warehouseSellerProfile; }
  get warehouseStock() { return this.compat.warehouseStock; }
  get pincodeZone() { return this.compat.pincodeZone; }
  get shippingRate() { return this.compat.shippingRate; }
  get rateSurcharge() { return this.compat.rateSurcharge; }
  get return() { return this.compat.return; }
  get pickup() { return this.compat.pickup; }
  get manifest() { return this.compat.manifest; }
  get manifestItem() { return this.compat.manifestItem; }
  get ndrCase() { return this.compat.ndrCase; }
  get codRemittance() { return this.compat.codRemittance; }
  get webhookSubscription() { return this.compat.webhookSubscription; }
  get idempotencyKey() { return this.compat.idempotencyKey; }
  get ewayBill() { return this.compat.ewayBill; }
  get shopifyStore() { return this.compat.shopifyStore; }
  get shopifyOrder() { return this.compat.shopifyOrder; }
  get shopifyWebhookEvent() { return this.compat.shopifyWebhookEvent; }
  get wooCommerceStore() { return this.compat.wooCommerceStore; }
  get wooCommerceOrder() { return this.compat.wooCommerceOrder; }
  get role() { return this.compat.role; }
  get onboardingState() { return this.compat.onboardingState; }
  get payment() { return this.compat.payment; }
  get refund() { return this.compat.refund; }
  get subscription() { return this.compat.subscription; }
  get invoice() { return this.compat.invoice; }
  get invoiceItem() { return this.compat.invoiceItem; }
  get invoiceSequence() { return this.compat.invoiceSequence; }
  get refreshToken() { return this.compat.refreshToken; }
}
