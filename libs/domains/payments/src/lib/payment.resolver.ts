import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PaymentService } from './services/payment.service';
import {
  Payment,
  Refund,
  PaymentIntent,
  PaymentStatus,
  PaymentGateway,
} from './payment.model';
import {
  CreatePaymentIntentInput,
  VerifyPaymentInput,
  RefundPaymentInput,
} from './dto/create-payment-intent.input';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/**
 * Payment Resolver
 * 
 * GraphQL resolver for payment operations.
 * 
 * Features:
 * - Create payment intents
 * - Verify payments
 * - Process refunds
 * - Query payment history
 * 
 * Authentication:
 * - Most mutations require authentication
 * - Users can only access their own payments
 */
@Resolver(() => Payment)
export class PaymentResolver {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Create a payment intent
   * 
   * Creates a payment intent with the specified gateway and returns
   * client secret for frontend payment processing.
   */
  @Mutation(() => PaymentIntent, { description: 'Create a payment intent' })
  @UseGuards(GqlAuthGuard)
  async createPaymentIntent(
    @Args('input') input: CreatePaymentIntentInput,
    @CurrentUser() user: any,
  ): Promise<PaymentIntent> {
    console.log('[PaymentResolver] createPaymentIntent', {
      userId: input.userId,
      amount: input.amount,
      gateway: input.gateway,
      orderId: input.orderId,
    });

    // Ensure user can only create payments for themselves
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
      status: result.status as any,
    };
  }

  /**
   * Verify a payment
   * 
   * Verifies payment status with the gateway and updates local record.
   */
  @Mutation(() => Payment, { description: 'Verify a payment status' })
  @UseGuards(GqlAuthGuard)
  async verifyPayment(
    @Args('input') input: VerifyPaymentInput,
    @CurrentUser() user: any,
  ): Promise<Payment> {
    console.log('[PaymentResolver] verifyPayment', { paymentId: input.paymentId });

    const payment = await this.paymentService.verifyPayment(input.paymentId);

    // Ensure user can only verify their own payments
    if (payment.userId !== user.id) {
      throw new Error('You can only verify your own payments');
    }

    return payment as any;
  }

  /**
   * Process a refund
   * 
   * Processes a full or partial refund for a payment.
   */
  @Mutation(() => Refund, { description: 'Process a refund' })
  @UseGuards(GqlAuthGuard)
  async refundPayment(
    @Args('input') input: RefundPaymentInput,
    @CurrentUser() user: any,
  ): Promise<Refund> {
    console.log('[PaymentResolver] refundPayment', {
      paymentId: input.paymentId,
      amount: input.amount,
      reason: input.reason,
    });

    const payment = await this.paymentService.getPayment(input.paymentId);

    // Ensure user can only refund their own payments
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

  /**
   * Get payment by ID
   */
  @Query(() => Payment, { description: 'Get payment by ID' })
  @UseGuards(GqlAuthGuard)
  async payment(
    @Args('id') id: string,
    @CurrentUser() user: any,
  ): Promise<Payment> {
    const payment = await this.paymentService.getPayment(id);

    // Ensure user can only access their own payments
    if (payment.userId !== user.id) {
      throw new Error('You can only access your own payments');
    }

    return payment as any;
  }

  /**
   * Get payments by user
   */
  @Query(() => [Payment], { description: 'Get payments by user ID' })
  @UseGuards(GqlAuthGuard)
  async paymentsByUser(
    @Args('userId', { type: () => Int }) userId: number,
    @CurrentUser() user: any,
  ): Promise<Payment[]> {
    // Ensure user can only access their own payments
    if (userId !== user.id) {
      throw new Error('You can only access your own payments');
    }

    return this.paymentService.getPaymentsByUser(userId) as any;
  }

  /**
   * Get payments by order
   */
  @Query(() => [Payment], { description: 'Get payments by order ID' })
  @UseGuards(GqlAuthGuard)
  async paymentsByOrder(
    @Args('orderId', { type: () => Int }) orderId: number,
    @CurrentUser() user: any,
  ): Promise<Payment[]> {
    const payments = await this.paymentService.getPaymentsByOrder(orderId);

    // Ensure user can only access payments for their own orders
    if (payments.length > 0 && payments[0].userId !== user.id) {
      throw new Error('You can only access payments for your own orders');
    }

    return payments as any;
  }

  /**
   * Get available payment gateways
   */
  @Query(() => [String], { description: 'Get available payment gateways' })
  async availableGateways(): Promise<string[]> {
    return this.paymentService['gatewayFactory'].getAvailableGateways();
  }
}
