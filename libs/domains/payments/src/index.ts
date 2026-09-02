/**
 * Barrel for the payments lib.
 *
 * SS-043g: now exports the TypeORM-backed module + service + resolver.
 * Legacy `src/payments/*` re-exports have been removed.
 */
export { PaymentsModule, PaymentsModule as PaymentsLibModule } from './lib/payments.module';
export { PaymentService, PaymentService as PaymentsLibService } from './lib/services/payment.service';
export { PaymentResolver, PaymentResolver as PaymentsLibResolver } from './lib/payment.resolver';
export {
  PaymentModel,
  PaymentModel as Payment,
  RefundModel,
  PaymentIntent,
  SubscriptionPlan,
  PaymentStatus,
  PaymentGateway,
  PaymentMethod,
  PaymentReconciliationStatus,
} from './lib/payment.model';
export * from './lib/dto/create-payment-intent.input';
export * from './lib/interfaces/payment-gateway.interface';
