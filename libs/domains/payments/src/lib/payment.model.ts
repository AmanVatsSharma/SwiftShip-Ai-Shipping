import { ObjectType, Field, Int, Float, registerEnumType } from '@nestjs/graphql';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/order.model';
import { Invoice } from '../billing/billing.model';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CANCELLED = 'CANCELLED',
}

registerEnumType(PaymentStatus, {
  name: 'PaymentStatus',
});

export enum PaymentGateway {
  STRIPE = 'STRIPE',
  RAZORPAY = 'RAZORPAY',
}

registerEnumType(PaymentGateway, {
  name: 'PaymentGateway',
});

export enum PaymentMethod {
  CARD = 'CARD',
  UPI = 'UPI',
  NETBANKING = 'NETBANKING',
  WALLET = 'WALLET',
  COD = 'COD',
}

registerEnumType(PaymentMethod, {
  name: 'PaymentMethod',
});

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
export class Payment {
  @Field()
  id: string;

  @Field(() => Int)
  userId: number;

  @Field(() => User, { nullable: true })
  user?: User;

  @Field(() => Int, { nullable: true })
  orderId?: number;

  @Field(() => Order, { nullable: true })
  order?: Order;

  @Field({ nullable: true })
  invoiceId?: string;

  @Field(() => Invoice, { nullable: true })
  invoice?: Invoice;

  @Field(() => Float)
  amount: number;

  @Field()
  currency: string;

  @Field(() => PaymentStatus)
  status: PaymentStatus;

  @Field(() => PaymentGateway)
  gateway: PaymentGateway;

  @Field({ nullable: true })
  gatewayPaymentId?: string;

  @Field(() => PaymentMethod, { nullable: true })
  paymentMethod?: PaymentMethod;

  @Field({ nullable: true })
  failureReason?: string;

  @Field(() => Float)
  refundedAmount: number;

  @Field(() => PaymentReconciliationStatus)
  reconciliationStatus: PaymentReconciliationStatus;

  @Field({ nullable: true })
  reconciledAt?: Date;

  @Field(() => [Refund], { nullable: true })
  refunds?: Refund[];

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@ObjectType()
export class Refund {
  @Field()
  id: string;

  @Field()
  paymentId: string;

  @Field(() => Payment, { nullable: true })
  payment?: Payment;

  @Field(() => Float)
  amount: number;

  @Field()
  currency: string;

  @Field({ nullable: true })
  gatewayRefundId?: string;

  @Field({ nullable: true })
  reason?: string;

  @Field(() => PaymentStatus)
  status: PaymentStatus;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@ObjectType()
export class PaymentIntent {
  @Field()
  paymentId: string;

  @Field({ nullable: true })
  clientSecret?: string;

  @Field(() => Float)
  amount: number;

  @Field()
  currency: string;

  @Field(() => PaymentStatus)
  status: PaymentStatus;
}

@ObjectType()
export class SubscriptionPlan {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field(() => Float)
  price: number;

  @Field()
  currency: string;

  @Field()
  interval: string; // monthly, yearly

  @Field(() => [String], { nullable: true })
  features?: string[];
}
