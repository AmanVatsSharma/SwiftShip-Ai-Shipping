/**
 * SS-027 — small wrapper service that hides TypeORM entity types from
 * tsoa's metadata generator. tsoa scans constructor parameter types
 * to derive OpenAPI models, and TypeORM's `Repository<T>` generic
 * leaks the entity class into the schema. We resolve repositories
 * via a string token + the platform-typeorm `getRepositoryToken` so
 * no entity class ever appears in the public type graph.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackingResponse, TrackingEventDto, TrackingEventStatus } from './tracking.model';

// Use string literals for the table names — these are the underlying
// Postgres table names. We use `getRepositoryToken` + `@InjectRepository`
// with the entity name registered by the platform-typeorm module.
const SHIPMENT_REPO_TOKEN = getRepositoryToken('ShipmentEntity' as any);
const TRACKING_REPO_TOKEN = getRepositoryToken('TrackingEventEntity' as any);

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(SHIPMENT_REPO_TOKEN as any)
    private readonly shipmentRepo: Repository<any>,
    @InjectRepository(TRACKING_REPO_TOKEN as any)
    private readonly trackingRepo: Repository<any>,
  ) {}

  async trackByAwb(awb: string): Promise<TrackingResponse | null> {
    const shipment = await this.shipmentRepo.findOne({
      where: { trackingNumber: awb },
    });
    if (!shipment) return null;

    const events = await this.trackingRepo.find({
      where: { trackingNumber: awb },
      order: { occurredAt: 'DESC' },
    });

    const mapped: TrackingEventDto[] = events.map((e: any) => ({
      id: e.id,
      trackingNumber: e.trackingNumber,
      status: (e.status ?? 'PENDING') as TrackingEventStatus,
      subStatus: e.subStatus ?? undefined,
      description: e.description ?? undefined,
      eventCode: e.eventCode ?? undefined,
      location: e.location ?? undefined,
      occurredAt: e.occurredAt,
      rawJson: e.rawJson ?? undefined,
    }));

    return {
      trackingNumber: awb,
      status: (shipment.status ?? 'PENDING') as TrackingEventStatus,
      events: mapped,
      totalEvents: mapped.length,
    };
  }
}
