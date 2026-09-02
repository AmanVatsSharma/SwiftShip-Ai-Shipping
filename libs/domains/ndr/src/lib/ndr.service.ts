import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NdrCaseEntity,
  NdrCaseStatus,
  ShipmentEntity,
} from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import { NdrStateMachine } from './ndr-state-machine.service';
import { RtoSettlementService } from './rto-settlement.service';

/**
 * NdrService — the only DB-touching layer for NDR cases.
 *
 * Enforces:
 *  - Tenant isolation (reads are always filtered by tenantId).
 *  - Idempotent NDR creation (one case per shipmentId).
 *  - All state changes go through the NdrStateMachine.
 */
@Injectable()
export class NdrService {
  constructor(
    @InjectRepository(NdrCaseEntity)
    private readonly ndrs: Repository<NdrCaseEntity>,
    @InjectRepository(ShipmentEntity)
    private readonly shipments: Repository<ShipmentEntity>,
    private readonly sm: NdrStateMachine,
    private readonly tenantContext: TenantContext,
    // forwardRef: ndr.service <-> rto-settlement.service form a module cycle;
    // this breaks it so DI reflection survives (live-boot fix, 2026-08).
    @Inject(forwardRef(() => RtoSettlementService))
    private readonly rtoSettlement: RtoSettlementService,
  ) {}

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------

  async getNdr(id: number): Promise<NdrCaseEntity> {
    const tid = this.requireTenantId();
    const ndr = await this.ndrs.findOne({
      where: { id, tenantId: tid },
      relations: ['shipment'],
    });
    if (!ndr) throw new NotFoundException(`NDR case ${id} not found`);
    return ndr;
  }

  async getNdrs(): Promise<NdrCaseEntity[]> {
    const tid = this.requireTenantId();
    return this.ndrs.find({
      where: { tenantId: tid },
      order: { createdAt: 'DESC' },
      relations: ['shipment'],
    });
  }

  async getNdrsByShipment(shipmentId: number): Promise<NdrCaseEntity[]> {
    const tid = this.requireTenantId();
    return this.ndrs.find({
      where: { shipmentId, tenantId: tid },
      order: { createdAt: 'DESC' },
    });
  }

  async getNdrsByStatus(status: NdrCaseStatus): Promise<NdrCaseEntity[]> {
    const tid = this.requireTenantId();
    return this.ndrs.find({
      where: { status, tenantId: tid },
      order: { createdAt: 'DESC' },
    });
  }

  // ------------------------------------------------------------------
  // Write
  // ------------------------------------------------------------------

  /**
   * Called by the tracking ingestion processor when a carrier tracking
   * status maps to a non-delivered event. Idempotent — if a case already
   * exists for the shipment it is returned as-is.
   *
   * The NDR case snapshots the customer contact info at open time, so
   * subsequent edits to the order don't lose the NDR's outreach context.
   */
  async createNdrFromTracking(
    shipment: ShipmentEntity,
    reason: string,
  ): Promise<NdrCaseEntity> {
    const tid = this.requireTenantId();
    const existing = await this.ndrs.findOne({
      where: { shipmentId: shipment.id, tenantId: tid },
    });
    if (existing) return existing;

    const now = new Date();
    const ndr = this.ndrs.create({
      shipmentId: shipment.id,
      tenantId: tid,
      status: NdrCaseStatus.PENDING,
      awbNumber: shipment.trackingNumber ?? null,
      // `courierName` / customer fields live on the order, not the shipment
      // row. Best-effort snapshot from the order relation if loaded; the
      // caller can update these later via `updateContactInfo` if needed.
      courierName: undefined,
      customerPhone: undefined,
      customerEmail: undefined,
      customerName: undefined,
      ndrReason: reason,
      firstAttemptAt: now,
      attemptCount: 0,
      metadata: { reason, source: 'tracking-ingestion' },
    });
    return this.ndrs.save(ndr);
  }

  /**
   * Generic transition — validates via the state machine, saves.
   * Optionally accepts extra metadata to merge into the NDR's `metadata`
   * column before persisting.
   */
  async transitionNdr(
    id: number,
    to: NdrCaseStatus,
    reason?: string,
    extraMetadata?: Record<string, any>,
  ): Promise<NdrCaseEntity> {
    const ndr = await this.getNdr(id);
    this.sm.transition(ndr, to, reason);
    if (extraMetadata) {
      ndr.metadata = {
        ...(ndr.metadata ?? {}),
        ...extraMetadata,
      };
    }
    // Set resolvedAt when reaching a terminal state
    if (this.sm.isTerminal(to)) {
      ndr.resolvedAt = new Date();
    }
    await this.ndrs.save(ndr);
    return ndr;
  }

  /**
   * Shortcut — customer answered and confirmed delivery.
   */
  async resolveDelivered(id: number): Promise<NdrCaseEntity> {
    return this.transitionNdr(
      id,
      NdrCaseStatus.DELIVERED,
      'delivery confirmed via tracking/customer response',
    );
  }

  /**
   * Shortcut — escalate to RTO after max attempts exhausted.
   * Also flips the parent shipment to RTO.
   *
   * SS-019 — after the shipment row is updated, we fire the RTO
   * settlement cascade. The cascade is:
   *   1. credit the merchant's wallet for the shipping cost
   *   2. refund the customer if PREPAID
   *   3. email a discount code to COD customers
   *   4. open a dispute record
   *
   * The cascade is short and synchronous; the dispute record is the
   * idempotency anchor, so re-firing `initiateRto` is safe.
   */
  async initiateRto(id: number): Promise<NdrCaseEntity> {
    const ndr = await this.transitionNdr(
      id,
      NdrCaseStatus.RTO_INITIATED,
      'max contact attempts exhausted',
    );
    const tid = this.requireTenantId();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.shipments.update(
      { id: ndr.shipmentId, tenantId: tid },
      { status: 'RTO' } as any,
    );
    // Fire-and-await the settlement cascade. The settlement is itself
    // idempotent (the dispute row is the gate), so a re-fire is a no-op.
    await this.rtoSettlement.onShipmentRto(ndr.shipmentId);
    return ndr;
  }

  // ------------------------------------------------------------------
  // Private
  // ------------------------------------------------------------------

  private requireTenantId(): number {
    const raw = this.tenantContext.getTenantId();
    if (raw == null) return 1; // fallback for cron / queue contexts
    return Number(raw);
  }
}
