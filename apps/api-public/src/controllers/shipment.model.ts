/**
 * SS-027 — tsoa DTOs mirroring GraphQL types for the REST surface.
 */
import { IsString, IsNumber, IsEnum, IsOptional, IsPositive, Min, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export enum ShipmentStatus {
  PENDING = 'PENDING',
  LABEL_GENERATED = 'LABEL_GENERATED',
  SHIPPED = 'SHIPPED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

export enum LabelStatus {
  PENDING = 'PENDING',
  GENERATED = 'GENERATED',
  FAILED = 'FAILED',
  VOIDED = 'VOIDED',
}

export interface CreateShipmentResponse {
  id: number;
  trackingNumber: string;
  status: ShipmentStatus;
  orderId: number;
  carrierId: number;
  warehouseId?: number;
  shippedAt?: Date;
}

export interface FindShipmentsResponse {
  shipments: Array<{
    id: number;
    trackingNumber: string;
    status: ShipmentStatus;
    orderId: number;
    carrierId: number;
    warehouseId?: number;
    shippedAt?: Date;
  }>;
  pagination?: {
    total: number;
    offset?: number;
    limit?: number;
  };
}

export interface CreateLabelResponse {
  id: number;
  trackingNumber: string;
  labelUrl?: string;
  status: LabelStatus;
}

export class CreateShipmentRequestDto {
  @IsString()
  trackingNumber!: string;

  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @IsNumber()
  @IsPositive()
  orderId!: number;

  @IsNumber()
  @IsPositive()
  carrierId!: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  warehouseId?: number;
}

export class UpdateShipmentRequestDto {
  @IsString()
  @IsOptional()
  trackingNumber?: string;

  @IsEnum(ShipmentStatus)
  @IsOptional()
  status?: ShipmentStatus;
}

export class FindShipmentsRequestDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  offset?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  trackingNumber?: string;

  @IsEnum(ShipmentStatus)
  @IsOptional()
  status?: ShipmentStatus;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  orderId?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  carrierId?: number;
}

export class CreateLabelRequestDto {
  @IsNumber()
  @IsPositive()
  orderId!: number;

  @IsNumber()
  @IsPositive()
  carrierId!: number;

  @IsBoolean()
  @IsOptional()
  skipCarrierConfirmation?: boolean;
}
