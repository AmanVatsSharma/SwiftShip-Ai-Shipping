import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Input for the plain `rateShop(request)` GraphQL query (SS-103).
 *
 * This is the legacy multi-carrier shop WITHOUT ranking: the resolver
 * delegates straight to `RateShopService.shopRates()` from
 * `@swiftship/platform-rate-cache` (Redis cache + circuit breaker +
 * adapter fan-out). Ranking / SLA caps / courier-score gates live on
 * `rankedRateShop` instead.
 *
 * The legacy `RateShopRequest` (Prisma era) also carried `warehouseId`
 * and `preferences` — those only fed the legacy local scoring loop and
 * have no meaning for the platform `RateShopService`, so they are not
 * part of this input.
 */
@InputType()
export class RateShopRequestInput {
  @Field(() => String, { description: 'Origin pincode (6-digit Indian postal code)' })
  @IsString()
  originPincode!: string;

  @Field(() => String, { description: 'Destination pincode' })
  @IsString()
  destinationPincode!: string;

  @Field(() => Int, { description: 'Shippable weight in grams' })
  @IsInt()
  @Min(1)
  weightGrams!: number;

  @Field(() => String, { defaultValue: 'PREPAID' })
  @IsIn(['PREPAID', 'COD'])
  paymentMethod!: 'PREPAID' | 'COD';

  /** Declared value in paise (COD risk / declared-value surcharges). */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  declaredValuePaise?: number;

  /** Optional package dimensions (cm) for volumetric weight. */
  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  lengthCm?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  widthCm?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  heightCm?: number;

  /** Restrict the shop to a single carrier code. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  courierCode?: string;
}

/**
 * Input for the `checkServiceability(params)` GraphQL query — a
 * pincode-pair serviceability check (SS-103).
 */
@InputType()
export class ServiceabilityParamsInput {
  @Field(() => String, { description: 'Origin pincode' })
  @IsString()
  originPincode!: string;

  @Field(() => String, { description: 'Destination pincode' })
  @IsString()
  destinationPincode!: string;

  /**
   * Optional warehouse — when set, the warehouse_coverage row for
   * (warehouseId, destinationPincode) is returned with TAT / ODA data.
   */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  warehouseId?: number;
}
