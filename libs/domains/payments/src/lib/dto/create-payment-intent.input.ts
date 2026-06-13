import { InputType, Field, Int, Float } from '@nestjs/graphql';
import { IsNotEmpty, IsNumber, IsString, IsEnum, IsOptional, Min } from 'class-validator';
import { PaymentGateway } from '../payment.model';

@InputType()
export class CreatePaymentIntentInput {
  @Field(() => Int)
  @IsNotEmpty()
  @IsNumber()
  userId: number;

  @Field(() => Float)
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @Field({ defaultValue: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @Field(() => PaymentGateway)
  @IsNotEmpty()
  @IsEnum(PaymentGateway)
  gateway: PaymentGateway;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  orderId?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @Field({ nullable: true })
  @IsOptional()
  metadata?: Record<string, any>;
}

@InputType()
export class VerifyPaymentInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  paymentId: string;
}

@InputType()
export class RefundPaymentInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  paymentId: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;
}
