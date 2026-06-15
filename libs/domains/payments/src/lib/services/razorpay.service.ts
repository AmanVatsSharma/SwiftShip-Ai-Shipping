/**
 * Razorpay Payment Gateway Service
 *
 * Implements Razorpay payment gateway integration for the Indian market.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import {
  PaymentGateway,
  PaymentIntent,
  PaymentResult,
  RefundResult,
  PaymentGatewayError,
} from '../interfaces/payment-gateway.interface';
import crypto from 'crypto';

@Injectable()
export class RazorpayService implements PaymentGateway {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly razorpay: Razorpay;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');

    if (!keyId || !keySecret) {
      throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required');
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    this.webhookSecret =
      this.config.get<string>('RAZORPAY_WEBHOOK_SECRET') || '';
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, any>
  ): Promise<PaymentIntent> {
    try {
      const amountInPaise = Math.round(Number(amount) * 100);
      const order = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: currency.toUpperCase(),
        receipt: metadata?.receipt || `receipt_${Date.now()}`,
        notes: metadata || {},
      });

      return {
        id: order.id,
        amount: Number(order.amount) / 100,
        currency: order.currency,
        status: this.mapRazorpayOrderStatus(order.status),
        clientSecret: order.id,
        metadata: (order.notes as Record<string, any>) || {},
      };
    } catch (error: any) {
      throw new PaymentGatewayError(
        error?.error?.description || error?.message || 'Failed to create payment order',
        error?.error?.code || 'RAZORPAY_ERROR',
        'RAZORPAY',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  async verifyPayment(paymentId: string): Promise<PaymentResult> {
    try {
      const payment = await this.razorpay.payments.fetch(paymentId);
      return {
        paymentId: payment.id,
        status: this.mapRazorpayPaymentStatus(payment.status),
        gatewayPaymentId: payment.id,
        metadata: payment.notes as Record<string, any>,
      };
    } catch (error: any) {
      throw new PaymentGatewayError(
        error?.error?.description || error?.message || 'Failed to verify payment',
        error?.error?.code || 'RAZORPAY_ERROR',
        'RAZORPAY',
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
      const refundParams: any = {
        payment_id: paymentId,
        ...(amount && { amount: Math.round(amount * 100) }),
        ...(reason && { notes: { reason } }),
      };

      const refund = await this.razorpay.payments.refund(
        paymentId,
        refundParams
      );
      return {
        refundId: refund.id,
        status: this.mapRazorpayRefundStatus(refund.status),
        gatewayRefundId: refund.id,
        amount: (refund.amount || 0) / 100,
        metadata: (refund.notes as Record<string, any>) || {},
      };
    } catch (error: any) {
      throw new PaymentGatewayError(
        error?.error?.description || error?.message || 'Failed to process refund',
        error?.error?.code || 'RAZORPAY_ERROR',
        'RAZORPAY',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
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
    const event = payload.event;
    const entity =
      payload.payload?.payment?.entity || payload.payload?.refund?.entity;

    let paymentId = '';
    let status = '';

    if (event === 'payment.captured' || event === 'payment.authorized') {
      paymentId = entity?.id || '';
      status = 'succeeded';
    } else if (event === 'payment.failed') {
      paymentId = entity?.id || '';
      status = 'failed';
    } else if (event === 'refund.created' || event === 'refund.processed') {
      paymentId = entity?.payment_id || '';
      status = 'refunded';
    }

    return {
      type: event,
      paymentId,
      status,
      metadata: entity?.notes as Record<string, any>,
    };
  }

  private mapRazorpayOrderStatus(
    status: string
  ): PaymentIntent['status'] {
    switch (status) {
      case 'paid':
        return 'succeeded';
      case 'attempted':
        return 'processing';
      case 'created':
        return 'pending';
      default:
        return 'pending';
    }
  }

  private mapRazorpayPaymentStatus(
    status: string
  ): 'succeeded' | 'failed' | 'pending' {
    switch (status) {
      case 'captured':
      case 'authorized':
        return 'succeeded';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  private mapRazorpayRefundStatus(
    status: string
  ): RefundResult['status'] {
    switch (status) {
      case 'processed':
        return 'succeeded';
      case 'pending':
        return 'pending';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }
}
