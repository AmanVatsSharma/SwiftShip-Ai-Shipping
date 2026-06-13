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
export class UpdateShipmentInput {
  @Field(() => Int)
  @IsNotEmpty({ message: 'Shipment ID is required' })
  @IsInt({ message: 'Shipment ID must be an integer' })
  @IsPositive({ message: 'Shipment ID must be positive' })
  id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Tracking number must be a string' })
  trackingNumber?: string;

  @Field(() => ShipmentStatus, { nullable: true })
  @IsOptional()
  @IsEnum(ShipmentStatus, { message: 'Invalid shipment status' })
  status?: ShipmentStatus;

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
