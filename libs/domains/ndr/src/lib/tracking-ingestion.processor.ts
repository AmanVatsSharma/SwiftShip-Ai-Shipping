import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NdrCaseEntity,
  NdrCaseStatus,
  ShipmentEntity,
  ShipmentStatus,
  TrackingEventEntity,
} from '@swiftship/platform-typeorm';
import { QueuesService } from '@swiftship/platform-queues';
import { NdrService } from './ndr.service';
import { NdrStateMachine } from './ndr-state-machine.service';

/**
 * Tracking → NDR mapping.
 *
 * Carrier adapters emit raw tracking status strings which vary by
 * carrier (Delhivery, BlueDart, Shadowfax, etc.). We normalise them
 * to one of three NDR actions:
 *
 *   - `create_ndr`  → open a new PENDING NDR case (or surface the existing one)
 *   - `resolve`     → mark an existing NDR case as DELIVERED
 *   - `rto`         → escalate to RTO_INITIATED
 *
 * Unknown tracking statuses fall through to `create_ndr` with a
 * `PENDING` reason — the safest default (better to over-alert than
 * miss an undeliverable shipment).
 */
export type TrackingToNdrAction = 'create_ndr' | 'resolve' | 'rto' | 'ignore';

interface TrackingNdrMapping {
  action: TrackingToNdrAction;
  reason: string;
}

const TRACKING_TO_NDR: Record<string, TrackingNdrMapping> = {
  // Non-delivery events — open (or re-surface) an NDR
  NOT_DELIVERED: { action: 'create_ndr', reason: 'NOT_DELIVERED' },
  CUSTOMER_NOT_AVAILABLE: {
    action: 'create_ndr',
    reason: 'CUSTOMER_NOT_AVAILABLE',
  },
  ADDRESS_INCOMPLETE: { action: 'create_ndr', reason: 'ADDRESS_INCOMPLETE' },
  OUT_FOR_DELIVERY: { action: 'create_ndr', reason: 'OUT_FOR_DELIVERY' },
  DELIVERY_ATTEMPTED: { action: 'create_ndr', reason: 'DELIVERY_ATTEMPTED' },
  PHONE_UNREACHABLE: { action: 'create_ndr', reason: 'PHONE_UNREACHABLE' },
  CONSIGNEE_REFUSED: { action: 'create_ndr', reason: 'CONSIGNEE_REFUSED' },

  // Delivery confirmed
  DELIVERED: { action: 'resolve', reason: 'DELIVERED' },

  // RTO
  RTO_INITIATED: { action: 'rto', reason: 'RTO_INITIATED' },
  RTO: { action: 'rto', reason: 'RTO' },
  RTO_DELIVERED: { action: 'rto', reason: 'RTO_DELIVERED' },
  LOST: { action: 'rto', reason: 'LOST' },
  DAMAGED: { action: 'rto', reason: 'DAMAGED' },

  // Not interesting
  IN_TRANSIT: { action: 'ignore', reason: 'IN_TRANSIT' },
  PICKED_UP: { action: 'ignore', reason: 'PICKED_UP' },
  MANIFESTED: { action: 'ignore', reason: 'MANIFESTED' },
};

/** Normalise a carrier status string (uppercase, trimmed) and look it up. */
function mapTrackingStatus(rawStatus: string): TrackingNdrMapping {
  const key = String(rawStatus ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return (
    TRACKING_TO_NDR[key] ?? { action: 'create_ndr', reason: `UNKNOWN:${key}` }
  );
}

/**
 * BullMQ job payload pushed by the shipments lib's tracking ingestion
 * endpoint (or the carrier webhook handlers).
 */
export interface TrackingIngestionJobData {
  shipmentId: number;
  trackingStatus: string;
  carrierCode: string;
  trackingNumber?: string;
  description?: string;
  location?: string;
  occurredAt?: string;
}

/**
 * TrackingIngestionProcessor — BullMQ worker bound to the
 * `tracking-events` queue. Each job represents a single carrier
 * tracking event. The processor:
 *
 *   1. Persists the event to `tracking_events`.
 *   2. Maps the carrier status → NDR action.
 *   3. Updates or creates the corresponding NDR case.
 *   4. Updates the parent shipment status.
 *
 * Concurrency: 5 jobs in flight per worker (configurable via env later).
 */
@Injectable()
export class TrackingIngestionProcessor implements OnModuleInit {
  static readonly QUEUE = 'tracking-events';

  private readonly logger = new Logger(TrackingIngestionProcessor.name);

  constructor(
    private readonly queues: QueuesService,
    @InjectRepository(ShipmentEntity)
    private readonly shipments: Repository<ShipmentEntity>,
    @InjectRepository(TrackingEventEntity)
    private readonly tracking: Repository<TrackingEventEntity>,
    @InjectRepository(NdrCaseEntity)
    private readonly ndrs: Repository<NdrCaseEntity>,
    private readonly ndrService: NdrService,
    private readonly sm: NdrStateMachine,
  ) {}

  onModuleInit() {
    this.queues.createWorker(
      TrackingIngestionProcessor.QUEUE,
      (job) => this.process(job.data as TrackingIngestionJobData),
    );
  }

  /**
   * Handle one tracking event. Exposed publicly so callers (GraphQL
   * mutations, webhooks, REST controllers) can invoke it directly
   * without going through the queue.
   */
  async process(payload: TrackingIngestionJobData): Promise<{
    action: TrackingToNdrAction;
    ndrId?: number;
    shipmentId: number;
  }> {
    if (!payload || !payload.shipmentId) {
      this.logger.warn('tracking.processor.bad_payload', payload as any);
      return { action: 'ignore', shipmentId: payload?.shipmentId ?? -1 };
    }

    const shipment = await this.shipments.findOne({
      where: { id: payload.shipmentId },
    });
    if (!shipment) {
      this.logger.warn(
        `tracking.processor.unknown_shipment ${payload.shipmentId}`,
      );
      return { action: 'ignore', shipmentId: payload.shipmentId };
    }

    // 1. Persist the raw tracking event
    await this.tracking.save(
      this.tracking.create({
        shipmentId: shipment.id,
        trackingNumber:
          payload.trackingNumber ?? shipment.trackingNumber ?? '',
        status: payload.trackingStatus,
        description: payload.description ?? null,
        location: payload.location ?? null,
        occurredAt: payload.occurredAt
          ? new Date(payload.occurredAt)
          : new Date(),
      }),
    );

    const mapping = mapTrackingStatus(payload.trackingStatus);
    this.logger.log(
      `tracking.${mapping.action} ${payload.trackingStatus} → shipment ${shipment.id} (${payload.carrierCode})`,
    );

    if (mapping.action === 'ignore') {
      return { action: 'ignore', shipmentId: shipment.id };
    }

    if (mapping.action === 'create_ndr') {
      const ndr = await this.ndrService.createNdrFromTracking(
        shipment,
        mapping.reason,
      );
      return { action: 'create_ndr', ndrId: ndr.id, shipmentId: shipment.id };
    }

    if (mapping.action === 'resolve') {
      // Idempotent: if no NDR exists, nothing to resolve. If it does, close
      // it via the state machine (it must be in a non-terminal state).
      const ndr = await this.ndrs.findOne({
        where: { shipmentId: shipment.id },
      });
      if (!ndr) {
        return { action: 'resolve', shipmentId: shipment.id };
      }
      if (this.sm.isTerminal(ndr.status)) {
        return { action: 'resolve', ndrId: ndr.id, shipmentId: shipment.id };
      }
      this.sm.transition(ndr, NdrCaseStatus.DELIVERED, 'tracking event DELIVERED');
      ndr.resolvedAt = new Date();
      await this.ndrs.save(ndr);
      return { action: 'resolve', ndrId: ndr.id, shipmentId: shipment.id };
    }

    // mapping.action === 'rto'
    const ndr = await this.ndrs.findOne({
      where: { shipmentId: shipment.id },
    });
    if (ndr && !this.sm.isTerminal(ndr.status)) {
      this.sm.transition(
        ndr,
        NdrCaseStatus.RTO_INITIATED,
        `tracking event ${payload.trackingStatus}`,
      );
      ndr.resolvedAt = null;
      await this.ndrs.save(ndr);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.shipments.update(
      { id: shipment.id },
      { status: ShipmentStatus.DELIVERED } as any,
    );
    // If we want a literal 'RTO' rather than 'DELIVERED', the carrier
    // adapter should push the tracking event with status `RTO` and a
    // shipments-side handler can flip it; we keep this conservative for now.
    return {
      action: 'rto',
      ndrId: ndr?.id,
      shipmentId: shipment.id,
    };
  }
}
