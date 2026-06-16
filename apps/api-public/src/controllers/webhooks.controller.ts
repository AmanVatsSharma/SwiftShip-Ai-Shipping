/**
 * SS-027 — tsoa WebhooksController.
 *
 * Inbound webhook from carriers + internal event subscribers.
 * Mirrors `libs/domains/webhooks/src/lib/webhooks.controller.ts` but
 * uses the clean tenant-scoped `ShipmentsService.ingestTracking`
 * method instead of the PrismaCompat shim. Carrier HMAC verification
 * is intentionally **out of scope** for the public REST surface —
 * carriers authenticate via mTLS or shared-secret headers, not via
 * `X-Swiftship-Api-Key`. For the public REST surface we trust the
 * IP allowlist in the upstream LB.
 */
import {
  Controller,
  Post,
  Body,
  Route,
  Tags,
  SuccessResponse,
} from 'tsoa';
import { Injectable } from '@nestjs/common';
import { ShipmentsService } from '../../../../libs/domains/shipments/src/lib/shipments.service';
import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class IngestTrackingDto {
  @IsNumber()
  shipmentId!: number;

  @IsString()
  trackingNumber!: string;

  @IsString()
  status!: string;

  @IsString()
  @IsOptional()
  subStatus?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  eventCode?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsDateString()
  occurredAt!: string;

  @IsString()
  @IsOptional()
  rawJson?: string;
}

export interface IngestTrackingResponse {
  id: number;
  shipmentId: number;
  trackingNumber: string;
  status: string;
  occurredAt: Date;
}

@Injectable()
@Route('v1/webhooks')
@Tags('Webhooks')
export class WebhooksController extends Controller {
  constructor(private readonly shipmentsService: ShipmentsService) {
    super();
  }

  /**
   * Carrier tracking webhook. Body shape follows the internal
   * `IngestTrackingInput` — carriers must adapt their payloads to
   * this shape (or use the SwiftShip adapter library in their
   * integration code).
   */
  @Post('tracking')
  @SuccessResponse('200', 'Tracking event ingested')
  public async ingestTracking(
    @Body() body: IngestTrackingDto,
  ): Promise<IngestTrackingResponse> {
    const result: any = await this.shipmentsService.ingestTracking({
      shipmentId: body.shipmentId,
      trackingNumber: body.trackingNumber,
      status: body.status,
      subStatus: body.subStatus,
      description: body.description,
      eventCode: body.eventCode,
      location: body.location,
      occurredAt: new Date(body.occurredAt),
      rawJson: body.rawJson,
    });
    return {
      id: result.id,
      shipmentId: result.shipmentId,
      trackingNumber: result.trackingNumber,
      status: result.status,
      occurredAt: result.occurredAt,
    };
  }
}
