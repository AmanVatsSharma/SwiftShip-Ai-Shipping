import { InputType, Field, Int } from '@nestjs/graphql';
import { OrderStatus } from './order.model';
import {
  IsEnum,
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';

@InputType()
export class OrdersFilterInput {
  @Field(() => OrderStatus, { nullable: true })
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Invalid order status' })
  status?: OrderStatus;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'User ID must be an integer' })
  @IsPositive({ message: 'User ID must be positive' })
  userId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'Carrier ID must be an integer' })
  @IsPositive({ message: 'Carrier ID must be positive' })
  carrierId?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Order number must be a string' })
  orderNumber?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt({ message: 'Warehouse ID must be an integer' })
  @IsPositive({ message: 'Warehouse ID must be positive' })
  warehouseId?: number;
}
