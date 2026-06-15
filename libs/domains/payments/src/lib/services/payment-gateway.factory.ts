/**
 * Payment Gateway Factory
 *
 * Creates and manages payment gateway instances.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGateway } from '../interfaces/payment-gateway.interface';
import { StripeService } from './stripe.service';
import { RazorpayService } from './razorpay.service';

@Injectable()
export class PaymentGatewayFactory {
  private readonly gateways: Map<string, PaymentGateway> = new Map();

  constructor(
    private readonly config: ConfigService,
    private readonly stripeService: StripeService,
    private readonly razorpayService: RazorpayService,
  ) {
    this.initializeGateways();
  }

  private initializeGateways(): void {
    // Initialize Stripe if credentials are available
    try {
      const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
      if (stripeKey) {
        this.gateways.set('STRIPE', this.stripeService);
      }
    } catch {
      // ignore — Stripe not configured
    }

    // Initialize Razorpay if credentials are available
    try {
      const razorpayKeyId = this.config.get<string>('RAZORPAY_KEY_ID');
      const razorpayKeySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
      if (razorpayKeyId && razorpayKeySecret) {
        this.gateways.set('RAZORPAY', this.razorpayService);
      }
    } catch {
      // ignore — Razorpay not configured
    }
  }

  getGateway(gatewayName: string): PaymentGateway {
    const gateway = this.gateways.get(gatewayName.toUpperCase());
    if (!gateway) {
      throw new Error(
        `Payment gateway '${gatewayName}' is not available. Available gateways: ${Array.from(
          this.gateways.keys(),
        ).join(', ')}`,
      );
    }
    return gateway;
  }

  getDefaultGateway(): PaymentGateway {
    const defaultGatewayName = this.config.get<string>(
      'PAYMENT_DEFAULT_GATEWAY',
      'RAZORPAY',
    );
    return this.getGateway(defaultGatewayName);
  }

  getAvailableGateways(): string[] {
    return Array.from(this.gateways.keys());
  }
}
