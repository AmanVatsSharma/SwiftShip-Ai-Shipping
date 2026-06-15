/**
 * SS-043g — Payments Lib Module (TypeORM-backed).
 *
 * Wires the four repository injections the service needs (payments,
 * refunds, invoices, orders, users) and exposes the gateway factory
 * (Stripe + Razorpay) and the resolver.
 *
 * No more legacy PrismaService. The shim
 * is going away in SS-044.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import {
  InvoiceEntity,
  OrderEntity,
  PaymentEntity,
  RefundEntity,
  UserEntity,
} from '@swiftship/platform-typeorm';
import { PaymentService } from './services/payment.service';
import { PaymentGatewayFactory } from './services/payment-gateway.factory';
import { StripeService } from './services/stripe.service';
import { RazorpayService } from './services/razorpay.service';
import { PaymentResolver } from './payment.resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      RefundEntity,
      InvoiceEntity,
      OrderEntity,
      UserEntity,
    ]),
    AuthLibModule,
  ],
  providers: [
    StripeService,
    RazorpayService,
    PaymentGatewayFactory,
    PaymentService,
    PaymentResolver,
  ],
  exports: [PaymentService, PaymentGatewayFactory],
})
export class PaymentsModule {}
