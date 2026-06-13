// Re-export barrel for the Payments lib.
// Until Plan 3 ships a full TypeORM implementation, the src/ implementation
// runs against PrismaCompat (TypeORM-backed). New consumers should import
// from `@swiftship/domains-payments` rather than the relative `../payments` paths.

export { PaymentsModule, PaymentsModule as PaymentsLibModule } from '../../../../src/payments/payments.module';
export { PaymentService, PaymentService as PaymentsLibService } from '../../../../src/payments/services/payment.service';
export { PaymentResolver, PaymentResolver as PaymentsLibResolver } from '../../../../src/payments/payment.resolver';
export { PaymentModel } from '../../../../src/payments/payment.model';
export * from '../../../../src/payments/dto';
export * from '../../../../src/payments/interfaces';
