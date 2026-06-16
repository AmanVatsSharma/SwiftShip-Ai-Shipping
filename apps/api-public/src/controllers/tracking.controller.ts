/**
 * SS-027 — tsoa TrackingController.
 *
 * Public customer-facing tracking endpoint. **NO** `X-Swiftship-Api-Key`
 * required (the controller has no `@Security('api_key')` annotation) so
 * shoppers can check AWB status on a tracking page without credentials.
 *
 * The actual repository access lives in `TrackingService` so that
 * TypeORM `Repository<T>` generic types don't leak into tsoa's
 * metadata model (they reference entity classes that tsoa tries to
 * turn into OpenAPI schemas and fails on).
 */
import {
  Controller,
  Get,
  Path,
  Route,
  Tags,
  SuccessResponse,
  Response,
} from 'tsoa';
import { NotFoundException } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { TrackingResponse } from './tracking.model';

@Route('v1/track')
@Tags('Tracking')
export class TrackingController extends Controller {
  constructor(private readonly trackingService: TrackingService) {
    super();
  }

  /**
   * Public AWB lookup. Returns 404 if the AWB is not in the system
   * (or has been archived — there is no way to distinguish from the
   * outside, by design).
   */
  @Get('{awb}')
  @SuccessResponse('200', 'Tracking payload')
  @Response<NotFoundException>(404, 'AWB not found')
  public async trackByAwb(@Path() awb: string): Promise<TrackingResponse> {
    const result = await this.trackingService.trackByAwb(awb);
    if (!result) throw new NotFoundException(`AWB ${awb} not found`);
    return result;
  }
}
