/**
 * Invoice email worker (BullMQ-backed, TypeORM-native).
 *
 * Ported from the legacy `src/billing/services/invoice-email.worker.ts`
 * (which was Prisma-bound) as part of the src-to-libs decommission.
 * Contract preserved: `enqueue(invoiceId)` fans an 'invoice-email' job onto
 * Redis; a processor loads the invoice, renders the PDF via `PdfService`,
 * uploads it via `StorageService`, and emails the buyer a download link when
 * SMTP is configured (no-op with a warning otherwise).
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import nodemailer from 'nodemailer';
import { InvoiceEntity } from '@swiftship/platform-typeorm';
import { QueuesService } from '@swiftship/platform-queues';
import { PdfService } from './pdf.service';
import { StorageService } from '@swiftship/domains-storage';

const QUEUE_NAME = 'invoice-email';

@Injectable()
export class InvoiceEmailWorker implements OnModuleInit {
  private readonly logger = new Logger(InvoiceEmailWorker.name);

  constructor(
    private readonly queues: QueuesService,
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    this.queues.createWorker(QUEUE_NAME, async (job: { invoiceId: string; correlationId?: string }) => {
      await this.process(job.invoiceId).catch((error: unknown) => {
        this.logger.error('invoice-email job failed', {
          invoiceId: job.invoiceId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });
    });
  }

  /** Fan out one email job. Fire-and-forget friendly (returns the BullMQ job). */
  async enqueue(invoiceId: string): Promise<unknown> {
    return this.queues.add(QUEUE_NAME, { invoiceId });
  }

  private async process(invoiceId: string): Promise<void> {
    const invoice = await this.invoices.findOne({ where: { id: invoiceId } });
    if (!invoice) {
      this.logger.warn('invoice-email: invoice not found, skipping', { invoiceId });
      return;
    }

    const pdf = await this.pdfService.generateInvoicePdf(invoice as never);
    const key = `invoices/${invoice.id}/${invoice.invoiceNumber}.pdf`;
    const { url } = await this.storage.uploadBuffer(
      key,
      pdf,
      'application/pdf',
      { cacheControl: 'private, max-age=3600' },
    );

    await this.sendEmail(invoice, url);
  }

  private async sendEmail(invoice: InvoiceEntity, url: string): Promise<void> {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.log(
        'SMTP_HOST not configured — invoice PDF generated and stored, email skipped',
        { invoiceId: invoice.id, url },
      );
      return;
    }

    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });

    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? 'no-reply@swiftship.ai',
      to: invoice.buyerEmail ?? undefined,
      subject: `Invoice ${invoice.invoiceNumber}`,
      text: `Your invoice ${invoice.invoiceNumber} is ready: ${url}`,
    });
  }
}
