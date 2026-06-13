import { InputType, Field, Float, Int } from '@nestjs/graphql';
import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPhoneNumber, IsString, Length, Max, Min } from 'class-validator';

@InputType()
export class BuyerDetailsInput {
  @Field(() => String, { description: 'Buyer legal or trading name' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field(() => String, { description: 'Buyer GSTIN', nullable: true })
  @IsOptional()
  @Length(15, 15)
  gstin?: string;

  @Field(() => String, { description: 'Buyer state or union territory', nullable: true })
  @IsOptional()
  @IsString()
  state?: string;

  @Field(() => String, { description: 'Primary email for invoice delivery', nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field(() => String, { description: 'Buyer phone number', nullable: true })
  @IsOptional()
  @IsPhoneNumber('IN')
  phone?: string;

  @Field(() => String, { description: 'Address line 1', nullable: true })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @Field(() => String, { description: 'Address line 2', nullable: true })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @Field(() => String, { description: 'City', nullable: true })
  @IsOptional()
  @IsString()
  city?: string;

  @Field(() => String, { description: 'Postal code', nullable: true })
  @IsOptional()
  @IsString()
  pincode?: string;

  @Field(() => String, { description: 'Country', nullable: true, defaultValue: 'India' })
  @IsOptional()
  @IsString()
  country?: string;
}

/**
 * Input for creating an invoice item
 */
@InputType()
export class CreateInvoiceItemInput {
  @Field(() => String, { description: 'Item description' })
  @IsNotEmpty()
  @IsString()
  description: string;

  @Field(() => Int, { description: 'Quantity', defaultValue: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @Field(() => Float, { description: 'Unit price' })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @Field(() => String, { description: 'HSN/SAC code for GST', nullable: true })
  @IsOptional()
  @IsString()
  hsnCode?: string;

  @Field(() => Float, { description: 'Tax rate percentage (e.g., 18 for 18%)', defaultValue: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;
}

/**
 * Input for creating an invoice
 */
@InputType()
export class CreateInvoiceInput {
  @Field(() => Int, { description: 'User ID' })
  @IsInt()
  userId: number;

  @Field(() => Int, { description: 'Warehouse ID for fulfillment' })
  @IsInt()
  warehouseId: number;

  @Field(() => String, { description: 'Subscription ID (optional)', nullable: true })
  subscriptionId?: string;

  @Field(() => Int, {
    description: 'Seller profile override (defaults to warehouse default)',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  sellerProfileId?: number;

  @Field(() => BuyerDetailsInput, {
    description: 'Buyer details used for GST break-up and email delivery',
    nullable: true,
  })
  @IsOptional()
  buyer?: BuyerDetailsInput;

  @Field(() => [CreateInvoiceItemInput], { description: 'Invoice items' })
  items: CreateInvoiceItemInput[];

  @Field(() => String, { description: 'Currency code', defaultValue: 'INR' })
  currency?: string;

  @Field(() => Date, { description: 'Due date', nullable: true })
  dueDate?: Date;

  @Field(() => Object, { description: 'Additional metadata', nullable: true })
  metadata?: Record<string, any>;

  @Field(() => Boolean, {
    description: 'Automatically email the buyer once invoice PDF is ready',
    defaultValue: true,
  })
  @IsOptional()
  @IsBoolean()
  autoEmailBuyer?: boolean;
}
