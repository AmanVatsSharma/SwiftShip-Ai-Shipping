/**
 * SS-043g — Payment GraphQL Resolver.
 *
 * Authentication: most mutations and queries require `GqlAuthGuard`.
 * Authorization: callers can only operate on their own payments (the
 * service returns the row, the resolver checks `userId` ownership).
 */
import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard, CurrentUser } from '@swiftship/platform-auth';
import { PaymentService } from './services/payment.service';
import { PaymentGatewayFactory } from './services/payment-gateway.factory';
import {
  PaymentModel,
  RefundModel,
  PaymentIntent,
  PaymentStatus,
  PaymentGateway,
} from './payment.model';
import {
  CreatePaymentIntentInput,
  VerifyPaymentInput,
  RefundPaymentInput,
} from './dto/create-payment-intent.input';

@Resolver(() => PaymentModel)
export class PaymentResolver {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly gatewayFactory: PaymentGatewayFactory,
  ) {}

  @Mutation(() => PaymentIntent, { description: 'Create a payment intent' })
  @UseGuards(GqlAuthGuard)
  async createPaymentIntent(
    @Args('input') input: CreatePaymentIntentInput,
    @CurrentUser() user: any,
  ): Promise<PaymentIntent> {
    if (input.userId !== user.id) {
      throw new Error('You can only create payments for yourself');
    }

    const result = await this.paymentService.createPaymentIntent(
      input.userId,
      input.amount,
      input.currency || 'INR',
      input.gateway,
      input.orderId,
      input.invoiceId,
      input.metadata,
    );

    return {
      paymentId: result.paymentId,
      clientSecret: result.clientSecret,
      amount: result.amount,
      currency: result.currency,
      status: result.status as PaymentStatus,
    };
  }

  @Mutation(() => PaymentModel, { description: 'Verify a payment status' })
  @UseGuards(GqlAuthGuard)
  async verifyPayment(
    @Args('input') input: VerifyPaymentInput,
    @CurrentUser() user: any,
  ): Promise<PaymentModel> {
    const payment = await this.paymentService.verifyPayment(input.paymentId);

    if (payment.userId !== user.id) {
      throw new Error('You can only verify your own payments');
    }

    return payment as any;
  }

  @Mutation(() => RefundModel, { description: 'Process a refund' })
  @UseGuards(GqlAuthGuard)
  async refundPayment(
    @Args('input') input: RefundPaymentInput,
    @CurrentUser() user: any,
  ): Promise<RefundModel> {
    const payment = await this.paymentService.getPayment(input.paymentId);

    if (payment.userId !== user.id) {
      throw new Error('You can only refund your own payments');
    }

    const refund = await this.paymentService.refund(
      input.paymentId,
      input.amount,
      input.reason,
    );

    return refund as any;
  }

  @Query(() => PaymentModel, { description: 'Get payment by ID' })
  @UseGuards(GqlAuthGuard)
  async payment(
    @Args('id') id: string,
    @CurrentUser() user: any,
  ): Promise<PaymentModel> {
    const payment = await this.paymentService.getPayment(id);

    if (payment.userId !== user.id) {
      throw new Error('You can only access your own payments');
    }

    return payment as any;
  }

  @Query(() => [PaymentModel], { description: 'Get payments by user ID' })
  @UseGuards(GqlAuthGuard)
  async paymentsByUser(
    @Args('userId', { type: () => Int }) userId: number,
    @CurrentUser() user: any,
  ): Promise<PaymentModel[]> {
    if (userId !== user.id) {
      throw new Error('You can only access your own payments');
    }

    return (await this.paymentService.getPaymentsByUser(userId)) as any;
  }

  @Query(() => [PaymentModel], { description: 'Get payments by order ID' })
  @UseGuards(GqlAuthGuard)
  async paymentsByOrder(
    @Args('orderId', { type: () => Int }) orderId: number,
    @CurrentUser() user: any,
  ): Promise<PaymentModel[]> {
    const payments = await this.paymentService.getPaymentsByOrder(orderId);

    if (payments.length > 0 && payments[0].userId !== user.id) {
      throw new Error('You can only access payments for your own orders');
    }

    return payments as any;
  }

  @Query(() => [String], { description: 'Get available payment gateways' })
  async availableGateways(): Promise<string[]> {
    return this.gatewayFactory.getAvailableGateways();
  }
}
