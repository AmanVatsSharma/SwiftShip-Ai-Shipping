import { InputType, Field, Int } from '@nestjs/graphql';
import { ShipmentStatus } from './shipment.model';
import { IsEnum, IsOptional, IsInt, IsPositive } from 'class-validator';

@InputType()
export class ShipmentsFilterInput {
  @Field(() => ShipmentStatus, { nullable: true })
  @IsOptional()
  @IsEnum(ShipmentStatus, { message: 'Invalid shipment status' })
  status?: ShipmentStatus;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'Order ID must be an integer' })
  @IsPositive({ message: 'Order ID must be positive' })
  orderId?: number;

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
}
