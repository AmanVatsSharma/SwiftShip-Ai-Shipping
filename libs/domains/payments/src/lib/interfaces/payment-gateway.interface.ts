/**
 * Payment Gateway Interface (moved from src/payments/interfaces).
 *
 * Defines the contract for payment gateway implementations.
 * This abstraction allows switching between different payment providers
 * (Stripe, Razorpay, etc.) without changing business logic.
 */
export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  clientSecret?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  paymentId: string;
  status: 'succeeded' | 'failed' | 'pending';
  gatewayPaymentId: string;
  metadata?: Record<string, any>;
}

export interface RefundResult {
  refundId: string;
  status: 'succeeded' | 'failed' | 'pending';
  gatewayRefundId: string;
  amount: number;
  metadata?: Record<string, any>;
}

export interface PaymentGateway {
  createPaymentIntent(
    amount: number,
    currency: string,
    metadata?: Record<string, any>
  ): Promise<PaymentIntent>;

  verifyPayment(paymentId: string): Promise<PaymentResult>;

  refund(
    paymentId: string,
    amount?: number,
    reason?: string
  ): Promise<RefundResult>;

  verifyWebhook(payload: string, signature: string): boolean;

  parseWebhook(payload: any): {
    type: string;
    paymentId: string;
    status: string;
    metadata?: Record<string, any>;
  };
}

export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly gateway: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'PaymentGatewayError';
  }
}
