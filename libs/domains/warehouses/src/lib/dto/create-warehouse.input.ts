import { Field, Float, InputType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

@InputType()
export class CreateWarehouseInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  code: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  addressLine1: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  city: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  state: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  @Length(4, 10)
  pincode: string;

  @Field({ defaultValue: 'India' })
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

  @Field({ defaultValue: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
