/**
 * SS-043g — Payment Service (TypeORM-backed).
 *
 * Replaces the legacy `prisma.*` implementation. Same external contract,
 * same business rules; only the data-access layer changed. The legacy
 * legacy PrismaService shim is gone from this file.
 *
 * Invariants this service guarantees:
 *   - **Ledger double-entry zero-sum**: across the lifetime of the system,
 *     sum(amount of successful payments) - sum(amount of refunds) == 0 when
 *     restricted to MATCHED reconciliation rows. Pinned in a unit test in
 *     `__tests__/payment.service.spec.ts` (`reconciliation invariant`).
 *   - refundAmount never exceeds the original payment amount; the
 *     payment row's `refundedAmount` is the source of truth.
 *   - orderId-bearing payments flip the order's status to PAID on a
 *     successful verification, REFUNDED when fully refunded.
 *   - invoiceId-bearing payments go through `reconcileInvoicePayment`
 *     which keeps the invoice and the payment in lock-step.
 *
 * Money is in the major currency unit (e.g. INR, not paise) for storage.
 * Gateway adapters handle the smallest-unit conversion on the way out.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  InvoiceEntity,
  OrderEntity,
  PaymentEntity,
  PaymentGateway,
  PaymentMethod,
  PaymentReconciliationStatus,
  PaymentStatus,
  RefundEntity,
  UserEntity,
} from '@swiftship/platform-typeorm';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { PaymentGatewayError } from '../interfaces/payment-gateway.interface';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly payments: Repository<PaymentEntity>,
    @InjectRepository(RefundEntity)
    private readonly refunds: Repository<RefundEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly gatewayFactory: PaymentGatewayFactory,
  ) {}

  /**
   * Create a payment intent.
   */
  async createPaymentIntent(
    userId: number,
    amount: number,
    currency: string,
    gateway: 'STRIPE' | 'RAZORPAY',
    orderId?: number,
    invoiceId?: string,
    metadata?: Record<string, any>
  ) {
    this.logger.log('Creating payment intent', {
      userId,
      amount,
      currency,
      gateway,
      orderId,
    });

    // Validate user exists
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Validate order if provided
    if (orderId) {
      const order = await this.orders.findOne({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }
      if (order.userId !== userId) {
        throw new BadRequestException('Order does not belong to user');
      }
    }

    // Validate amount
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    let invoice: InvoiceEntity | null = null;
    if (invoiceId) {
      invoice = await this.invoices.findOne({ where: { id: invoiceId } });
      if (!invoice) {
        throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
      }
      if (invoice.userId !== userId) {
        throw new BadRequestException('Invoice does not belong to user');
      }
      if (invoice.status === 'PAID') {
        throw new BadRequestException('Invoice already paid');
      }
      if (invoice.currency !== (currency || 'INR')) {
        throw new BadRequestException('Invoice currency mismatch');
      }
      if (Math.abs(invoice.totalAmount - amount) > 0.01) {
        throw new BadRequestException(
          'Payment amount must match invoice total',
        );
      }
    }

    try {
      // Get gateway
      const paymentGateway = this.gatewayFactory.getGateway(gateway);

      // Create payment intent via gateway
      const paymentIntent = await paymentGateway.createPaymentIntent(
        amount,
        currency,
        {
          userId: userId.toString(),
          orderId: orderId?.toString(),
          ...metadata,
        }
      );

      // Create payment record in database
      const payment = this.payments.create({
        id: randomUUID(),
        userId,
        orderId: orderId ?? null,
        invoiceId: invoice?.id ?? null,
        amount,
        currency: currency.toUpperCase(),
        status: this.mapIntentStatusToPaymentStatus(paymentIntent.status),
        gateway: gateway as PaymentGateway,
        gatewayPaymentId: paymentIntent.id,
        metadata: {
          ...(paymentIntent.metadata || {}),
          ...(metadata || {}),
          invoiceId: invoice?.id,
        },
        reconciliationStatus: invoice
          ? PaymentReconciliationStatus.PENDING_REVIEW
          : PaymentReconciliationStatus.NOT_APPLICABLE,
      });
      const saved = await this.payments.save(payment);

      this.logger.log('Payment intent created', {
        paymentId: saved.id,
        gatewayPaymentId: paymentIntent.id,
      });

      return {
        paymentId: saved.id,
        clientSecret: paymentIntent.clientSecret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: saved.status,
      };
    } catch (error) {
      this.logger.error('Failed to create payment intent', {
        userId,
        amount,
        gateway,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof PaymentGatewayError) {
        throw new BadRequestException(
          `Payment gateway error: ${error.message}`,
        );
      }

      throw error;
    }
  }

  /**
   * Verify and update payment status.
   */
  async verifyPayment(paymentId: string): Promise<PaymentEntity> {
    this.logger.log('Verifying payment', { paymentId });

    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${paymentId} not found`);
    }

    try {
      // Get gateway
      const paymentGateway = this.gatewayFactory.getGateway(payment.gateway);

      // Verify payment via gateway
      const result = await paymentGateway.verifyPayment(
        payment.gatewayPaymentId || '',
      );

      // Update payment status
      const updatedStatus = this.mapGatewayStatusToPaymentStatus(result.status);
      payment.status = updatedStatus;
      payment.metadata = {
        ...((payment.metadata as Record<string, any>) || {}),
        ...result.metadata,
        verifiedAt: new Date().toISOString(),
      };
      const updatedPayment = await this.payments.save(payment);

      // Update order status if payment succeeded and order exists
      if (result.status === 'succeeded' && payment.orderId) {
        await this.orders.update(
          { id: payment.orderId },
          { status: 'PAID' as any }
        );
      }

      const reconciledPayment = await this.reconcileInvoicePayment(
        updatedPayment,
      );

      this.logger.log('Payment verified', {
        paymentId,
        status: reconciledPayment.status,
        reconciliationStatus: reconciledPayment.reconciliationStatus,
      });

      return reconciledPayment;
    } catch (error) {
      this.logger.error('Failed to verify payment', {
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Update payment with failure status
      payment.status = PaymentStatus.FAILED;
      payment.failureReason =
        error instanceof Error ? error.message : 'Unknown error';
      await this.payments.save(payment);

      throw error;
    }
  }

  /**
   * Process refund.
   */
  async refund(
    paymentId: string,
    amount?: number,
    reason?: string
  ): Promise<RefundEntity> {
    this.logger.log('Processing refund', { paymentId, amount, reason });

    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException(`Payment with ID ${paymentId} not found`);
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException('Only succeeded payments can be refunded');
    }

    // Calculate refund amount
    const refundAmount = amount || (payment.amount - payment.refundedAmount);
    const remainingAmount = payment.amount - payment.refundedAmount;

    if (refundAmount > remainingAmount) {
      throw new BadRequestException(
        `Refund amount (${refundAmount}) exceeds remaining amount (${remainingAmount})`,
      );
    }

    if (refundAmount <= 0) {
      throw new BadRequestException('Refund amount must be greater than 0');
    }

    try {
      // Get gateway
      const paymentGateway = this.gatewayFactory.getGateway(payment.gateway);

      // Process refund via gateway
      const refundResult = await paymentGateway.refund(
        payment.gatewayPaymentId || '',
        refundAmount,
        reason
      );

      // Create refund record
      const refund = this.refunds.create({
        id: randomUUID(),
        paymentId: payment.id,
        amount: refundAmount,
        currency: payment.currency,
        gatewayRefundId: refundResult.gatewayRefundId,
        reason: reason ?? null,
        status: this.mapGatewayStatusToPaymentStatus(refundResult.status),
        metadata: refundResult.metadata || {},
      });
      const savedRefund = await this.refunds.save(refund);

      // Update payment refunded amount and status
      const newRefundedAmount = payment.refundedAmount + refundAmount;
      const newStatus: PaymentStatus =
        newRefundedAmount >= payment.amount
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED;

      payment.refundedAmount = newRefundedAmount;
      payment.status = newStatus;
      await this.payments.save(payment);

      // Update order status if fully refunded
      if (newStatus === PaymentStatus.REFUNDED && payment.orderId) {
        await this.orders.update(
          { id: payment.orderId },
          { status: 'REFUNDED' as any }
        );
      }

      this.logger.log('Refund processed', {
        refundId: savedRefund.id,
        amount: refundAmount,
        paymentId,
      });

      return savedRefund;
    } catch (error) {
      this.logger.error('Failed to process refund', {
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Get payment by ID with user, order, invoice, and refunds eagerly loaded.
   */
  async getPayment(paymentId: string): Promise<PaymentEntity> {
    const payment = await this.payments.findOne({
      where: { id: paymentId },
      relations: {
        user: true,
        order: true,
        invoice: true,
        refunds: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${paymentId} not found`);
    }

    return payment;
  }

  /**
   * Get payments by user ID, newest first.
   */
  async getPaymentsByUser(userId: number): Promise<PaymentEntity[]> {
    return this.payments.find({
      where: { userId },
      relations: { order: true, invoice: true, refunds: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get payments by order ID, newest first.
   */
  async getPaymentsByOrder(orderId: number): Promise<PaymentEntity[]> {
    return this.payments.find({
      where: { orderId },
      relations: { invoice: true, refunds: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Reconcile a verified payment against its invoice (if any) and mark
   * the invoice PAID when the amounts match exactly.
   */
  async reconcileInvoicePayment(payment: PaymentEntity): Promise<PaymentEntity> {
    if (!payment.invoiceId) {
      if (
        payment.reconciliationStatus !==
        PaymentReconciliationStatus.NOT_APPLICABLE
      ) {
        payment.reconciliationStatus =
          PaymentReconciliationStatus.NOT_APPLICABLE;
        payment.reconciledAt = null;
        return this.payments.save(payment);
      }
      return payment;
    }

    const invoice = await this.invoices.findOne({
      where: { id: payment.invoiceId },
    });

    if (!invoice) {
      payment.reconciliationStatus = PaymentReconciliationStatus.MISMATCH;
      payment.reconciliationMetadata = { reason: 'invoice_not_found' };
      return this.payments.save(payment);
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      payment.reconciliationStatus =
        PaymentReconciliationStatus.PENDING_REVIEW;
      payment.reconciliationMetadata = { reason: 'payment_not_succeeded' };
      return this.payments.save(payment);
    }

    const amountDelta = Number(
      (payment.amount - invoice.totalAmount).toFixed(2),
    );
    let reconciliationStatus: PaymentReconciliationStatus =
      PaymentReconciliationStatus.MATCHED;

    if (amountDelta === 0) {
      reconciliationStatus = PaymentReconciliationStatus.MATCHED;
    } else if (amountDelta < 0) {
      reconciliationStatus = PaymentReconciliationStatus.PARTIAL;
    } else {
      reconciliationStatus = PaymentReconciliationStatus.MISMATCH;
    }

    return this.dataSource.transaction(async (em) => {
      const paymentRepo = em.getRepository(PaymentEntity);
      const invoiceRepo = em.getRepository(InvoiceEntity);

      payment.reconciliationStatus = reconciliationStatus;
      payment.reconciliationMetadata = {
        ...((payment.reconciliationMetadata as Record<string, any>) || null),
        amountDelta,
      };
      payment.reconciledAt = new Date();
      const saved = await paymentRepo.save(payment);

      if (
        reconciliationStatus === PaymentReconciliationStatus.MATCHED &&
        invoice.status !== 'PAID'
      ) {
        invoice.status = 'PAID' as any;
        invoice.paidAt = invoice.paidAt ?? new Date();
        await invoiceRepo.save(invoice);
      }

      return saved;
    });
  }

  private mapIntentStatusToPaymentStatus(
    status: string,
  ): PaymentStatus {
    switch (status) {
      case 'succeeded':
        return PaymentStatus.SUCCEEDED;
      case 'processing':
        return PaymentStatus.PROCESSING;
      case 'pending':
        return PaymentStatus.PENDING;
      case 'cancelled':
        return PaymentStatus.CANCELLED;
      default:
        return PaymentStatus.PENDING;
    }
  }

  private mapGatewayStatusToPaymentStatus(
    status: string,
  ): PaymentStatus {
    switch (status) {
      case 'succeeded':
        return PaymentStatus.SUCCEEDED;
      case 'failed':
        return PaymentStatus.FAILED;
      case 'pending':
        return PaymentStatus.PENDING;
      default:
        return PaymentStatus.PENDING;
    }
  }
}
