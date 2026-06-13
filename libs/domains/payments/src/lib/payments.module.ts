import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './services/payment.service';
import { PaymentGatewayFactory } from './services/payment-gateway.factory';
import { StripeService } from './services/stripe.service';
import { RazorpayService } from './services/razorpay.service';
import { PaymentResolver } from './payment.resolver';

/**
 * Payments Module
 * 
 * Handles all payment-related functionality including:
 * - Payment intent creation
 * - Payment processing
 * - Payment verification
 * - Refund processing
 * - Multiple gateway support (Stripe, Razorpay)
 * 
 * Dependencies:
 * - PrismaService: Database access
 * - ConfigService: Configuration management
 * 
 * Exports:
 * - PaymentService: For use in other modules
 */
@Module({
  providers: [
    PrismaService,
    StripeService,
    RazorpayService,
    PaymentGatewayFactory,
    PaymentService,
    PaymentResolver,
  ],
  exports: [PaymentService, PaymentGatewayFactory],
})
export class PaymentsModule {}
