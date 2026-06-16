/**
 * SS-027 — tsoa DTOs mirroring GraphQL types for the REST surface.
 *
 * These only exist for tsoa; GraphQL uses the same input/output classes from
 * `libs/domains/orders/src/lib/dto/*.ts` (and automatically emits them as
 * GraphQL schema types). tsoa reads these DTO annotations to generate
 * OpenAPI docs and request validation.
 */
import { IsString, IsNumber, IsEnum, IsOptional, IsPositive, IsNotEmpty, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  RTO = 'RTO',
  LOST = 'LOST',
  EXCEPTION = 'EXCEPTION',
}

export interface UpdateOrderResponse {
  id: number;
  orderNumber: string;
  total: number;
  status: OrderStatus;
  updatedAt: Date;
}

export interface FindOrdersResponse {
  orders: Array<{
    id: number;
    orderNumber: string;
    total: number;
    status: OrderStatus;
    createdAt: Date;
    userId: number;
    carrierId?: number | null;
  }>;
  pagination?: {
    total: number;
    offset?: number;
    limit?: number;
  };
}

export interface CreateOrderRequest {
  orderNumber: string;
  total: number;
  userId: number;
  status?: OrderStatus;
  carrierId?: number;
}

export interface FindOrdersRequest {
  offset?: number;
  limit?: number;
  orderNumber?: string;
  status?: OrderStatus;
  userId?: number;
  minCreatedAt?: Date;
  maxCreatedAt?: Date;
}

export class CreateOrderRequestDto {
  @IsString()
  orderNumber!: string;

  @Transform(
    ({ value }) => {
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        throw new Error('Total must be a positive number');
      }
      return num;
    },
    { toClassOnly: true },
  )
  @IsNumber()
  @Min(0)
  total!: number;

  @IsNumber()
  @IsPositive()
  userId!: number;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  carrierId?: number;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  destinationPincode?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  packageWeightGrams?: number;
}

export class FindOrdersRequestDto {
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
  orderNumber?: string;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  userId?: number;

  @IsString()
  @IsOptional()
  minCreatedAt?: string;

  @IsString()
  @IsOptional()
  maxCreatedAt?: string;
}
