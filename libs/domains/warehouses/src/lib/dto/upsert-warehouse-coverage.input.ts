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
export class UpsertWarehouseCoverageInput {
  @Field(() => Int)
  @IsInt()
  @IsPositive()
  warehouseId: number;

  @Field()
  @IsString()
  @Length(4, 10)
  pincode: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @IsPositive()
  tatDays?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isOda?: boolean;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  odaFee?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  minWeightGrams?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  maxWeightGrams?: number;
}
