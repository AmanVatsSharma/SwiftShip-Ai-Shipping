import { InputType, Field, Int, Float } from '@nestjs/graphql';
import { OrderStatus } from './order.model';
import { RateRankingStrategy } from '@swiftship/domains-rate-shop';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsInt,
  IsPositive,
  IsOptional,
  Min,
  Length,
} from 'class-validator';

@InputType()
export class CreateOrderInput {
  @Field()
  @IsNotEmpty({ message: 'Order number is required' })
  @IsString({ message: 'Order number must be a string' })
  orderNumber: string;

  @Field(() => Float)
  @IsNotEmpty({ message: 'Total is required' })
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: 'Total must be a number' },
  )
  @Min(0, { message: 'Total must be greater than or equal to 0' })
  total: number;

  @Field(() => Int)
  @IsNotEmpty({ message: 'User ID is required' })
  @IsInt({ message: 'User ID must be an integer' })
  @IsPositive({ message: 'User ID must be positive' })
  userId: number;

  @Field(() => OrderStatus, { nullable: true })
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Invalid order status' })
  status?: OrderStatus;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'Carrier ID must be an integer' })
  @IsPositive({ message: 'Carrier ID must be positive' })
  carrierId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'Warehouse ID must be an integer' })
  @IsPositive({ message: 'Warehouse ID must be positive' })
  warehouseId?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Destination name must be a string' })
  destinationName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Destination phone must be a string' })
  destinationPhone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Destination address line 1 must be a string' })
  destinationAddressLine1?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Destination address line 2 must be a string' })
  destinationAddressLine2?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Destination city must be a string' })
  destinationCity?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Destination state must be a string' })
  destinationState?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Destination country must be a string' })
  destinationCountry?: string;

  @Field()
  @IsNotEmpty({ message: 'Destination pincode is required' })
  @IsString({ message: 'Destination pincode must be a string' })
  @Length(4, 10, {
    message: 'Destination pincode must be between 4 and 10 characters',
  })
  destinationPincode: string;

  @Field(() => Int)
  @IsNotEmpty({ message: 'Package weight is required' })
  @IsInt({ message: 'Package weight must be an integer (grams)' })
  @IsPositive({ message: 'Package weight must be positive' })
  packageWeightGrams: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'Package length must be a number' })
  packageLengthCm?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'Package width must be a number' })
  packageWidthCm?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'Package height must be a number' })
  packageHeightCm?: number;

  /**
   * SS-015: when true (default), the rate-engine auto-picks the best carrier
   * for this order. When false, the merchant-supplied `carrierId` is used
   * as today.
   */
  @Field(() => Boolean, {
    defaultValue: true,
    description:
      'If true, the rate-engine picks the best carrier; if false, use the merchant-supplied carrierId',
  })
  @IsOptional()
  @IsBoolean({ message: 'rankRate must be a boolean' })
  rankRate?: boolean;

  /**
   * SS-015: optional override for the rate-engine strategy. When omitted
   * the merchant's tenant-level default (best_value) is used.
   */
  @Field(() => RateRankingStrategy, {
    nullable: true,
    description:
      'Strategy for the rate-engine to use; defaults to the tenant-level setting',
  })
  @IsOptional()
  @IsEnum(RateRankingStrategy, { message: 'Invalid rate strategy' })
  rateStrategy?: RateRankingStrategy;
}
