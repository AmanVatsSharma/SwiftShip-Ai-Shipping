/**
 * SS-027 — tsoa ShipmentsController.
 *
 * Mirrors the GraphQL surface in `libs/domains/shipments/src/lib/shipments.resolver.ts`
 * via direct TypeORM access. Auth: `X-Swiftship-Api-Key`.
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Path,
  Body,
  Query,
  Route,
  Security,
  Tags,
  SuccessResponse,
  Response,
} from 'tsoa';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ShipmentsService } from '../../../../libs/domains/shipments/src/lib/shipments.service';
import { CreateShipmentInput } from '../../../../libs/domains/shipments/src/lib/dto/create-shipment.input';
import { UpdateShipmentInput } from '../../../../libs/domains/shipments/src/lib/dto/update-shipment.input';
import { ShipmentsFilterInput } from '../../../../libs/domains/shipments/src/lib/dto/shipments-filter.input';
import { CreateLabelInput } from '../../../../libs/domains/shipments/src/lib/dto/create-label.input';
import {
  CreateShipmentRequestDto,
  UpdateShipmentRequestDto,
  FindShipmentsRequestDto,
  CreateLabelRequestDto,
  CreateShipmentResponse,
  FindShipmentsResponse,
  CreateLabelResponse,
} from './shipment.model';
import { ShipmentStatus, LabelStatus } from '@swiftship/platform-typeorm';

@Injectable()
@Route('v1/shipments')
@Tags('Shipments')
@Security('api_key')
export class ShipmentsController extends Controller {
  constructor(private readonly shipmentsService: ShipmentsService) {
    super();
  }

  /**
   * List shipments for the current tenant.
   */
  @Get()
  @SuccessResponse('200', 'OK')
  public async findShipments(
    @Query() query?: FindShipmentsRequestDto,
  ): Promise<FindShipmentsResponse> {
    const filter: ShipmentsFilterInput = {
      status: query?.status as ShipmentStatus,
      orderId: query?.orderId,
      carrierId: query?.carrierId,
    };
    let items = await this.shipmentsService.filterShipments(filter);
    if (query?.trackingNumber) {
      items = items.filter((s) => s.trackingNumber === query.trackingNumber);
    }
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? 25;
    const total = items.length;
    items = items.slice(offset, offset + limit);
    return {
      shipments: items.map((s) => ({
        id: s.id,
        trackingNumber: s.trackingNumber,
        status: s.status,
        orderId: s.orderId,
        carrierId: s.carrierId,
        warehouseId: s.warehouseId ?? undefined,
        shippedAt: s.shippedAt ?? undefined,
      })),
      pagination: { total, offset, limit },
    };
  }

  /**
   * Get a single shipment by id.
   */
  @Get('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Shipment not found')
  public async findShipmentById(@Path() id: number): Promise<CreateShipmentResponse> {
    const shipment = await this.shipmentsService.getShipment(id);
    if (!shipment) throw new NotFoundException('Shipment not found');
    return {
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      orderId: shipment.orderId,
      carrierId: shipment.carrierId,
      warehouseId: shipment.warehouseId ?? undefined,
      shippedAt: shipment.shippedAt ?? undefined,
    };
  }

  /**
   * Create a new shipment.
   */
  @Post()
  @SuccessResponse('201', 'Created')
  @Response<BadRequestException>(400, 'Invalid input')
  public async createShipment(
    @Body() body: CreateShipmentRequestDto,
  ): Promise<CreateShipmentResponse> {
    const input: CreateShipmentInput = {
      trackingNumber: body.trackingNumber,
      status: body.status as ShipmentStatus,
      orderId: body.orderId,
      carrierId: body.carrierId,
      warehouseId: body.warehouseId,
    };
    const created = await this.shipmentsService.createShipment(input);
    return {
      id: created.id,
      trackingNumber: created.trackingNumber,
      status: created.status,
      orderId: created.orderId,
      carrierId: created.carrierId,
      warehouseId: created.warehouseId ?? undefined,
      shippedAt: created.shippedAt ?? undefined,
    };
  }

  /**
   * Update a shipment by id.
   */
  @Patch('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Shipment not found')
  public async updateShipment(
    @Path() id: number,
    @Body() body: UpdateShipmentRequestDto,
  ): Promise<CreateShipmentResponse> {
    const input: UpdateShipmentInput = { id, ...body } as UpdateShipmentInput;
    const updated = await this.shipmentsService.updateShipment(input);
    return {
      id: updated.id,
      trackingNumber: updated.trackingNumber,
      status: updated.status,
      orderId: updated.orderId,
      carrierId: updated.carrierId,
      warehouseId: updated.warehouseId ?? undefined,
      shippedAt: updated.shippedAt ?? undefined,
    };
  }

  /**
   * Cancel a shipment by id.
   */
  @Delete('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Shipment not found')
  public async cancelShipment(@Path() id: number): Promise<CreateShipmentResponse> {
    const updated = await this.shipmentsService.cancelShipment(id);
    return {
      id: updated.id,
      trackingNumber: updated.trackingNumber,
      status: updated.status,
      orderId: updated.orderId,
      carrierId: updated.carrierId,
      warehouseId: updated.warehouseId ?? undefined,
      shippedAt: updated.shippedAt ?? undefined,
    };
  }

  /**
   * Generate a carrier shipping label for an order.
   */
  @Post('labels')
  @SuccessResponse('201', 'Label created')
  @Response<BadRequestException>(400, 'Invalid input')
  public async createLabel(
    @Body() body: CreateLabelRequestDto,
  ): Promise<CreateLabelResponse> {
    const input: CreateLabelInput = {
      shipmentId: body.orderId,
      carrierId: body.carrierId,
      skipCarrierConfirmation: body.skipCarrierConfirmation,
    } as unknown as CreateLabelInput;
    const label = await this.shipmentsService.generateLabel(input);
    return {
      id: label.id,
      trackingNumber: (label as any).trackingNumber ?? label.labelNumber,
      labelUrl: (label as any).labelUrl ?? undefined,
      status: label.status as unknown as LabelStatus,
    };
  }
}
