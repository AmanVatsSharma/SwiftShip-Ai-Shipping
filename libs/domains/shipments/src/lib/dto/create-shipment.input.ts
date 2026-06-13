import { InputType, Field, Int, Float } from '@nestjs/graphql';
import { ShipmentStatus } from './shipment.model';
import {
  IsNotEmpty,
  IsString,
  IsInt,
  IsPositive,
  IsEnum,
  IsOptional,
  IsDate,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class CreateShipmentInput {
  @Field()
  @IsNotEmpty({ message: 'Tracking number is required' })
  @IsString({ message: 'Tracking number must be a string' })
  trackingNumber: string;

  @Field(() => ShipmentStatus)
  @IsNotEmpty({ message: 'Shipment status is required' })
  @IsEnum(ShipmentStatus, { message: 'Invalid shipment status' })
  status: ShipmentStatus;

  @Field(() => Int)
  @IsNotEmpty({ message: 'Order ID is required' })
  @IsInt({ message: 'Order ID must be an integer' })
  @IsPositive({ message: 'Order ID must be positive' })
  orderId: number;

  @Field(() => Int)
  @IsNotEmpty({ message: 'Carrier ID is required' })
  @IsInt({ message: 'Carrier ID must be an integer' })
  @IsPositive({ message: 'Carrier ID must be positive' })
  carrierId: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsDate({ message: 'Shipped at must be a valid date' })
  @Type(() => Date)
  shippedAt?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @IsDate({ message: 'Delivered at must be a valid date' })
  @Type(() => Date)
  deliveredAt?: Date;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'Warehouse ID must be an integer' })
  @IsPositive({ message: 'Warehouse ID must be positive' })
  warehouseId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'Weight must be an integer' })
  @IsPositive({ message: 'Weight must be positive' })
  weightGrams?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'Length must be a number' })
  lengthCm?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'Width must be a number' })
  widthCm?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'Height must be a number' })
  heightCm?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Origin pincode must be a string' })
  originPincode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Destination pincode must be a string' })
  destinationPincode?: string;
}
