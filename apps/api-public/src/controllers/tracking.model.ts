/**
 * SS-027 — tsoa DTOs for the public tracking endpoint.
 *
 * NOTE: the per-event interface is named `TrackingEventDto` (not
 * `TrackingEvent`) to avoid a name collision with
 * `TrackingEventEntity` exported from `@swiftship/platform-typeorm`.
 * tsoa resolves types by symbol, not by source file, so a bare
 * `TrackingEvent` name would be ambiguous.
 */
import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum TrackingEventStatus {
  PENDING = 'PENDING',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  FAILED_ATTEMPT = 'FAILED_ATTEMPT',
  RETURNED = 'RETURNED',
}

export interface TrackingEventDto {
  id: number;
  trackingNumber: string;
  status: TrackingEventStatus;
  subStatus?: string;
  description?: string;
  eventCode?: string;
  location?: string;
  occurredAt: Date;
  rawJson?: string;
}

export interface TrackingResponse {
  trackingNumber: string;
  status: TrackingEventStatus;
  events: TrackingEventDto[];
  totalEvents: number;
}

export interface TrackByAwbRequest {
  awb: string;
}
