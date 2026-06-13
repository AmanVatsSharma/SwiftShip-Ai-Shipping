import { InputType, Field, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
} from 'class-validator';

@InputType()
export class CreateWarehouseSellerProfileInput {
  @Field(() => Int)
  @IsInt()
  warehouseId: number;

  @Field(() => String)
  @IsString()
  profileName: string;

  @Field(() => String)
  @IsString()
  legalName: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  displayName?: string;

  @Field(() => String)
  @Length(15, 15)
  gstin: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  pan?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  tan?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cin?: string;

  @Field(() => String)
  @IsString()
  addressLine1: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @Field(() => String)
  @IsString()
  city: string;

  @Field(() => String)
  @IsString()
  state: string;

  @Field(() => String)
  @IsString()
  pincode: string;

  @Field(() => String, { defaultValue: 'India' })
  @IsString()
  country: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsPhoneNumber('IN')
  phone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  bankIfsc?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  bankName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  bankBranch?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @Field({ defaultValue: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @Field({ defaultValue: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
