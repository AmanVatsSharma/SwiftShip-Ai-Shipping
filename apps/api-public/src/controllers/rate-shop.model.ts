/**
 * SS-027 — tsoa DTOs mirroring the public rate-shop wire shape.
 */
import { IsString, IsNumber, IsEnum, IsOptional, IsPositive, Min } from 'class-validator';

export enum PaymentMethod {
  PREPAID = 'PREPAID',
  COD = 'COD',
}

export enum RateStrategy {
  CHEAPEST = 'cheapest',
  FASTEST = 'fastest',
  BEST_VALUE = 'best_value',
  BALANCED = 'balanced',
  RELIABILITY_FIRST = 'reliability_first',
}

export interface RankedRateQuote {
  carrierCode: string;
  serviceType: string;
  ratePaise: number;
  rateInr: number;
  etaDays: { min: number; max: number };
  codAvailable: boolean;
  breakdown?: Record<string, unknown>;
}

export interface RateShopRankResponse {
  quotes: RankedRateQuote[];
  totalCandidates: number;
}

export class RateShopRankRequestDto {
  @IsString()
  originPincode!: string;

  @IsString()
  destinationPincode!: string;

  @IsNumber()
  @IsPositive()
  weightGrams!: number;

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsEnum(RateStrategy)
  @IsOptional()
  strategy?: RateStrategy;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxDeliveryDays?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minCourierScore?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  codAmountPaise?: number;
}
