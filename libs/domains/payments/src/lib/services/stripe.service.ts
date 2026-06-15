/**
 * Stripe Payment Gateway Service
 *
 * Implements Stripe payment gateway integration.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  PaymentGateway,
  PaymentIntent,
  PaymentResult,
  RefundResult,
  PaymentGatewayError,
} from '../interfaces/payment-gateway.interface';

@Injectable()
export class StripeService implements PaymentGateway {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-11-17.clover',
    });

    this.webhookSecret =
      this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '';
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, any>
  ): Promise<PaymentIntent> {
    const amountInCents = Math.round(amount * 100);

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency.toLowerCase(),
        metadata: metadata || {},
        automatic_payment_methods: { enabled: true },
      });

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        status: this.mapStripeStatus(paymentIntent.status),
        clientSecret: paymentIntent.client_secret || undefined,
        metadata: paymentIntent.metadata as Record<string, any>,
      };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        throw new PaymentGatewayError(
          error.message,
          error.code || 'STRIPE_ERROR',
          'STRIPE',
          error
        );
      }
      throw new PaymentGatewayError(
        'Failed to create payment intent',
        'UNKNOWN_ERROR',
        'STRIPE',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  async verifyPayment(paymentId: string): Promise<PaymentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentId);
      return {
        paymentId: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status) as
          | 'succeeded'
          | 'failed'
          | 'pending',
        gatewayPaymentId: paymentIntent.id,
        metadata: paymentIntent.metadata as Record<string, any>,
      };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        throw new PaymentGatewayError(
          error.message,
          error.code || 'STRIPE_ERROR',
          'STRIPE',
          error
        );
      }
      throw new PaymentGatewayError(
        'Failed to verify payment',
        'UNKNOWN_ERROR',
        'STRIPE',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  async refund(
    paymentId: string,
    amount?: number,
    reason?: string
  ): Promise<RefundResult> {
    try {
      const paymentIntent =
        await this.stripe.paymentIntents.retrieve(paymentId);
      const chargeId = paymentIntent.latest_charge;
      if (!chargeId || typeof chargeId !== 'string') {
        throw new PaymentGatewayError(
          'Payment intent has no charge',
          'NO_CHARGE',
          'STRIPE'
        );
      }

      const refundParams: Stripe.RefundCreateParams = {
        charge: chargeId,
        ...(amount && { amount: Math.round(amount * 100) }),
        ...(reason && { reason: reason as Stripe.RefundCreateParams.Reason }),
      };

      const refund = await this.stripe.refunds.create(refundParams);
      return {
        refundId: refund.id,
        status: this.mapStripeRefundStatus(refund.status || 'pending'),
        gatewayRefundId: refund.id,
        amount: (refund.amount || 0) / 100,
        metadata: {},
      };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        throw new PaymentGatewayError(
          error.message,
          error.code || 'STRIPE_ERROR',
          'STRIPE',
          error
        );
      }
      throw new PaymentGatewayError(
        'Failed to process refund',
        'UNKNOWN_ERROR',
        'STRIPE',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    try {
      this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  parseWebhook(payload: any): {
    type: string;
    paymentId: string;
    status: string;
    metadata?: Record<string, any>;
  } {
    const event = payload as Stripe.Event;
    let paymentId = '';
    let status = '';

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      paymentId = paymentIntent.id;
      status = 'succeeded';
    } else if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      paymentId = paymentIntent.id;
      status = 'failed';
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      paymentId = charge.payment_intent as string;
      status = 'refunded';
    }

    return {
      type: event.type,
      paymentId,
      status,
      metadata: (event.data.object as any).metadata as Record<string, any> || {},
    };
  }

  private mapStripeStatus(status: string): PaymentIntent['status'] {
    switch (status) {
      case 'succeeded':
        return 'succeeded';
      case 'processing':
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
      case 'requires_capture':
        return 'processing';
      case 'canceled':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  private mapStripeRefundStatus(
    status: string | null | undefined
  ): RefundResult['status'] {
    if (!status) return 'pending';

    switch (status) {
      case 'succeeded':
        return 'succeeded';
      case 'pending':
        return 'pending';
      case 'failed':
      case 'canceled':
        return 'failed';
      default:
        return 'pending';
    }
  }
}
