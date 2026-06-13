import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceService } from './services/invoice.service';
import { EwayBillService } from './services/eway-bill.service';
import { GstService } from './services/gst.service';
import { PdfService } from './services/pdf.service';
import { BillingResolver } from './billing.resolver';
import { QueuesModule } from '../queues/queues.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvoiceEmailWorker } from './services/invoice-email.worker';

/**
 * Billing Module
 * 
 * Handles all billing-related functionality including:
 * - Invoice generation and management
 * - PDF generation for invoices
 * - GST calculation and compliance
 * - E-way bill generation and tracking
 * 
 * Dependencies:
 * - PrismaService: Database access
 * - ConfigService: Configuration management
 * 
 * Exports:
 * - InvoiceService: For use in other modules
 * - EwayBillService: For use in other modules
 * - GstService: For use in other modules
 */
@Module({
  imports: [QueuesModule, NotificationsModule],
  providers: [
    PrismaService,
    InvoiceService,
    EwayBillService,
    GstService,
    PdfService,
    BillingResolver,
    InvoiceEmailWorker,
  ],
  exports: [InvoiceService, EwayBillService, GstService],
})
export class BillingModule {}
