import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NdrCaseEntity,
  OrderEntity,
  RtoDisputeEntity,
  ShipmentEntity,
} from '@swiftship/platform-typeorm';
import { StructuredLogger } from '@swiftship/observability';
import { TenantContext, WalletService } from '@swiftship/domains-tenants';
import { NdrService } from './ndr.service';

/**
 * SS-019 — RtoSettlementService
 *
 * Hook called when a shipment transitions to RTO (Return to Origin).
 * Carries out the four settlement actions in sequence:
 *
 *   1. Credit the merchant's wallet for the shipping cost
 *      (carriers bill the merchant for RTO shipping; the merchant can
 *      choose to absorb the cost or pass it on to the customer).
 *   2. Refund the customer if PREPAID
 *      (Razorpay / Stripe integration is owned by the payments lib; we
 *      delegate to `RefundService` if it's been wired in, else we log
 *      and move on — the dispute record lets the merchant recover
 *      out-of-band until a real refund integration lands).
 *   3. Send a discount code to COD customers
 *      (the customer paid nothing yet, but they were promised a
 *      delivery; SORRYXX is the apology token).
 *   4. Open a dispute record so the merchant can contest in the
 *      admin portal.
 *
 * The cascade is:
 *  - **idempotent** — if `onShipmentRto` is called twice for the same
 *    shipment (e.g. a re-fire from the tracking ingestion queue), the
 *    second call is a no-op because the dispute record already exists.
 *  - **async-safe** — if the wallet credit throws, we log and continue
 *    with the refund + dispute steps. The settlement's "best effort"
 *    boundary is each individual side-effect, not the whole cascade.
 *
 * Notes on the schema:
 *  - `shipment.shippingCostPaise` is not yet on `ShipmentEntity` (the
 *    carrier billing column lives in a separate ledger in production);
 *    we read it defensively (`?? 0`) so the service compiles today and
 *    will pick up the column once it lands.
 *  - `order.paymentMethod` and the customer contact fields are not on
 *    `OrderEntity` either. We fall back to the NDR-case snapshot, which
 *    is exactly what the SS-017 NDR creation logic was designed to
 *    capture.
 */
@Injectable()
export class RtoSettlementService {
  private readonly logger = new StructuredLogger(RtoSettlementService.name);

  constructor(
    @InjectRepository(ShipmentEntity)
    private readonly shipments: Repository<ShipmentEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(NdrCaseEntity)
    private readonly ndrs: Repository<NdrCaseEntity>,
    @InjectRepository(RtoDisputeEntity)
    private readonly disputes: Repository<RtoDisputeEntity>,
    private readonly wallet: WalletService,
    private readonly ndrService: NdrService,
    private readonly tenantContext: TenantContext,
    @Optional() private readonly refund?: RefundServiceLike,
    @Optional() private readonly notifier?: NotifierLike,
  ) {}

  /**
   * Hook called when a shipment transitions to RTO.
   *
   * Steps:
   *  1. Credit the merchant's wallet for the shipping cost
   *  2. Refund the customer if PREPAID
   *  3. Send a discount code if COD
   *  4. Create a dispute record (merchant can contest in admin portal)
   */
  async onShipmentRto(shipmentId: number): Promise<void> {
    const shipment = await this.shipments.findOne({
      where: { id: shipmentId },
      relations: ['order', 'ndrCase'],
    });
    if (!shipment) {
      this.logger.warn(`onShipmentRto: shipment ${shipmentId} not found, skipping`);
      return;
    }
    const order = shipment.order;
    if (!order) {
      this.logger.warn(
        `onShipmentRto: shipment ${shipmentId} has no order loaded, skipping`,
      );
      return;
    }

    // Idempotency — if a dispute row already exists for this shipment, the
    // settlement cascade has already run. The unique shipmentId is implicit
    // via the FK + the SS-019 migration's intent (one dispute per RTO).
    const existing = await this.disputes.findOne({
      where: { shipmentId },
    });
    if (existing) {
      this.logger.log(
        `onShipmentRto: shipment ${shipmentId} already settled (dispute ${existing.id}), skipping`,
      );
      return;
    }

    const tenantId = Number(shipment.tenantId ?? 1);
    // Defensive read — `shippingCostPaise` is not yet on ShipmentEntity but
    // the field is referenced from the spec; treat unknown as 0 to skip the
    // wallet credit step. Once the column lands this becomes a real read.
    const shippingCostPaise = Number(
      (shipment as { shippingCostPaise?: number }).shippingCostPaise ?? 0,
    );
    const orderTotalPaise = Number(order.total ?? 0);
    // Resolve the customer contact + payment method from the NDR snapshot.
    // The NDR case is the canonical record of "what we knew about this
    // delivery at attempt time" — the order row doesn't have these fields
    // and the dispute can be raised without them.
    const ndrCase = shipment.ndrCase ?? null;
    const customerEmail = ndrCase?.customerEmail ?? null;
    const customerName = ndrCase?.customerName ?? null;
    const paymentMethod = (ndrCase?.metadata as { paymentMethod?: string } | null)
      ?.paymentMethod as 'PREPAID' | 'COD' | undefined;

    // ----------------------------------------------------------------
    // 1. Credit the merchant's wallet for the shipping cost
    // ----------------------------------------------------------------
    if (shippingCostPaise > 0) {
      try {
        await this.wallet.topUp({
          tenantId,
          amount: shippingCostPaise,
          idempotencyKey: `RTO-credit:${shipment.trackingNumber ?? shipment.id}`,
          metadata: { shipmentId, type: 'rto_shipping_refund' },
        });
        this.logger.log(
          `Credited merchant wallet ${tenantId} +${shippingCostPaise}p (RTO shipping) for shipment ${shipmentId}`,
        );
      } catch (err) {
        this.logger.error(
          `Wallet credit failed for shipment ${shipmentId}: ${(err as Error).message}`,
        );
        // Continue — refund + dispute still happen.
      }
    }

    // ----------------------------------------------------------------
    // 2. Refund the customer if PREPAID
    // ----------------------------------------------------------------
    if (paymentMethod === 'PREPAID' && orderTotalPaise > 0) {
      if (!this.refund) {
        this.logger.warn(
          'RefundService not available; skipping customer refund for PREPAID order',
        );
      } else {
        try {
          await this.refund.processRefund(
            order.id,
            orderTotalPaise,
            'RTO-delivery-failed',
          );
          this.logger.log(
            `Refund processed for order ${order.id} (${orderTotalPaise} paise)`,
          );
        } catch (err) {
          this.logger.error(
            `Refund failed for order ${order.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    // ----------------------------------------------------------------
    // 3. Discount code for COD customers
    // ----------------------------------------------------------------
    if (paymentMethod === 'COD' && customerEmail) {
      const code = `SORRY${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      if (!this.notifier) {
        this.logger.warn(
          `Notifier not available; would have emailed ${code} to ${customerEmail}`,
        );
      } else {
        try {
          await this.notifier.sendEmail({
            to: customerEmail,
            template: 'rto_apology',
            params: {
              customerName: customerName ?? 'Customer',
              orderId: order.id,
              discountCode: code,
              discountPct: 15,
            },
          });
          this.logger.log(
            `Sent RTO apology email (code=${code}) to ${customerEmail} for order ${order.id}`,
          );
        } catch (err) {
          this.logger.error(
            `Apology email failed for order ${order.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    // ----------------------------------------------------------------
    // 4. Open a dispute record (merchant can contest in admin portal)
    // ----------------------------------------------------------------
    try {
      const dispute = this.disputes.create({
        shipmentId,
        orderId: order.id,
        tenantId,
        status: 'OPEN',
        reasonCode: ndrCase?.ndrReason ?? 'unknown',
        openedAt: new Date(),
      });
      await this.disputes.save(dispute);
      this.logger.log(
        `Opened RTO dispute ${dispute.id} for shipment ${shipmentId} (tenant ${tenantId})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to open RTO dispute for shipment ${shipmentId}: ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Minimal contract for the refund service. The real implementation lives
 * in the payments lib; we declare it here as a duck-typed interface so
 * the RTO settlement doesn't need to know about Stripe/Razorpay specifics.
 */
export interface RefundServiceLike {
  processRefund(orderId: number, amountPaise: number, reason: string): Promise<unknown>;
}

/**
 * Minimal contract for the customer notifier. The real implementation
 * lives in the notifications lib; we declare it here as a duck-typed
 * interface so the RTO settlement doesn't need to depend on a lib that
 * is still being built out.
 */
export interface NotifierLike {
  sendEmail(args: {
    to: string;
    template: string;
    params: Record<string, unknown>;
  }): Promise<unknown>;
}
