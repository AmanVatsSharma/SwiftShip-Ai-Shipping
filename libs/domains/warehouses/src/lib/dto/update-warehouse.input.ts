import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
} from 'class-validator';

@InputType()
export class UpdateWarehouseInput {
  @Field(() => Int)
  @IsInt()
  @IsPositive()
  id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  code?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  city?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  state?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(4, 10)
  pincode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  country?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  capacityCbm?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
