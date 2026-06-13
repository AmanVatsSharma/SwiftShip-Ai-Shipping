import { InputType, Field, Float } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsNumber, Min, IsEnum } from 'class-validator';

export enum ShopifyOrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  FULFILLED = 'FULFILLED',
  PARTIALLY_FULFILLED = 'PARTIALLY_FULFILLED'
}

@InputType()
export class CreateShopifyOrderInput {
  @Field(() => String, { description: 'The order number of the Shopify order' })
  @IsNotEmpty({ message: 'Order number cannot be empty' })
  @IsString({ message: 'Order number must be a string' })
  orderNumber: string;

  @Field(() => Float, { description: 'The total amount of the order' })
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Total must be a valid number' })
  @Min(0, { message: 'Total must be greater than or equal to 0' })
  total: number;

  @Field(() => String, { description: 'The status of the order' })
  @IsNotEmpty({ message: 'Status cannot be empty' })
  @IsEnum(ShopifyOrderStatus, { message: 'Status must be a valid order status' })
  status: string;

  @Field(() => String, { description: 'The ID of the Shopify store this order belongs to' })
  @IsNotEmpty({ message: 'Store ID cannot be empty' })
  @IsString({ message: 'Store ID must be a string' })
  storeId: string;
} 