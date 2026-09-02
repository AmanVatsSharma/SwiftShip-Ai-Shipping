/**
 * SS-043g — GraphQL model for the payments domain.
 *
 * The `ObjectType` classes here drive schema generation; the underlying
 * storage entities live in `@swiftship/platform-typeorm` (`PaymentEntity`,
 * `RefundEntity`). The GraphQL types deliberately mirror the TypeORM
 * entities 1:1 so resolver code can return them with no extra mapping.
 */
import {
  ObjectType,
  Field,
  Int,
  Float,
  registerEnumType,
} from '@nestjs/graphql';
import {
  PaymentEntity as Payment,
  RefundEntity as Refund,
} from '@swiftship/platform-typeorm';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CANCELLED = 'CANCELLED',
}

registerEnumType(PaymentStatus, { name: 'PaymentStatus' });

export enum PaymentGateway {
  STRIPE = 'STRIPE',
  RAZORPAY = 'RAZORPAY',
}

registerEnumType(PaymentGateway, { name: 'PaymentGateway' });

export enum PaymentMethod {
  CARD = 'CARD',
  UPI = 'UPI',
  NETBANKING = 'NETBANKING',
  WALLET = 'WALLET',
  COD = 'COD',
}

registerEnumType(PaymentMethod, { name: 'PaymentMethod' });

export enum PaymentReconciliationStatus {
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  PENDING_REVIEW = 'PENDING_REVIEW',
  MATCHED = 'MATCHED',
  PARTIAL = 'PARTIAL',
  MISMATCH = 'MISMATCH',
}

registerEnumType(PaymentReconciliationStatus, {
  name: 'PaymentReconciliationStatus',
});

@ObjectType()
export class PaymentModel {
  @Field()
  id!: string;

  @Field(() => Int)
  userId!: number;

  @Field(() => Int, { nullable: true })
  orderId?: number;

  @Field({ nullable: true })
  invoiceId?: string;

  @Field(() => Float)
  amount!: number;

  @Field()
  currency!: string;

  @Field(() => PaymentStatus)
  status!: PaymentStatus;

  @Field(() => PaymentGateway)
  gateway!: PaymentGateway;

  @Field({ nullable: true })
  gatewayPaymentId?: string;

  @Field(() => PaymentMethod, { nullable: true })
  paymentMethod?: PaymentMethod;

  @Field({ nullable: true })
  failureReason?: string;

  @Field(() => Float)
  refundedAmount!: number;

  @Field(() => PaymentReconciliationStatus)
  reconciliationStatus!: PaymentReconciliationStatus;

  @Field({ nullable: true })
  reconciledAt?: Date;

  @Field(() => [RefundModel], { nullable: true })
  refunds?: RefundModel[];

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class RefundModel {
  @Field()
  id!: string;

  @Field()
  paymentId!: string;

  @Field(() => PaymentModel, { nullable: true })
  payment?: PaymentModel;

  @Field(() => Float)
  amount!: number;

  @Field()
  currency!: string;

  @Field({ nullable: true })
  gatewayRefundId?: string;

  @Field({ nullable: true })
  reason?: string;

  @Field(() => PaymentStatus)
  status!: PaymentStatus;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class PaymentIntent {
  @Field()
  paymentId!: string;

  @Field({ nullable: true })
  clientSecret?: string;

  @Field(() => Float)
  amount!: number;

  @Field()
  currency!: string;

  @Field(() => PaymentStatus)
  status!: PaymentStatus;
}

@ObjectType()
export class SubscriptionPlan {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field(() => Float)
  price!: number;

  @Field()
  currency!: string;

  @Field()
  interval!: string;

  @Field(() => [String], { nullable: true })
  features?: string[];
}

// Legacy alias — billing.model (and other consumers) reference the GraphQL
// object type as `Payment`, the name the old src/payments model used.
export { PaymentModel as Payment };
