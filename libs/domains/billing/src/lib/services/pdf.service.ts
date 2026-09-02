import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';

/**
 * PDF Service
 * 
 * Handles PDF generation for invoices and other documents.
 * 
 * Features:
 * - Invoice PDF generation with GST details
 * - Professional invoice formatting
 * - Company branding support
 * 
 * Uses pdfkit library for PDF generation.
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  /**
   * Generate invoice PDF
   * 
   * Creates a professional invoice PDF with:
   * - Company details
   * - Invoice number and date
   * - Itemized billing
   * - GST breakdown (CGST, SGST, IGST)
   * - Total amounts
   */
  async generateInvoicePdf(invoice: any): Promise<Buffer> {
    console.log('[PdfService] generateInvoicePdf', { invoiceNumber: invoice.invoiceNumber });

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];

        // Collect PDF data
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Header
        doc
          .fontSize(20)
          .text('TAX INVOICE', { align: 'center' })
          .moveDown();

        const seller = invoice.sellerProfile;
        const sellerAddress = [
          seller?.addressLine1,
          seller?.addressLine2,
          seller?.city,
          seller?.state,
          seller?.pincode,
        ]
          .filter(Boolean)
          .join(', ');
        const sellerName = seller?.legalName || 'SwiftShip AI';
        const sellerGstin = seller?.gstin || '27ABCDE1234F1Z5';

        // Company details (left side)
        doc
          .fontSize(12)
          .text(sellerName, { align: 'left' })
          .fontSize(10)
          .text(sellerAddress || 'Billing address unavailable', { align: 'left' })
          .text(`GSTIN: ${sellerGstin}`, { align: 'left' })
          .moveDown();

        // Invoice details (right side)
        const invoiceDate = new Date(invoice.createdAt).toLocaleDateString('en-IN');
        doc
          .fontSize(10)
          .text(`Invoice Number: ${invoice.invoiceNumber}`, { align: 'right' })
          .text(`Invoice Date: ${invoiceDate}`, { align: 'right' })
          .text(`Status: ${invoice.status}`, { align: 'right' });

        if (invoice.dueDate) {
          const dueDate = new Date(invoice.dueDate).toLocaleDateString('en-IN');
          doc.text(`Due Date: ${dueDate}`, { align: 'right' });
        }

        doc.moveDown(2);

        // Bill To section
        if (invoice.user || invoice.buyerLegalName) {
          const buyerLines = [
            invoice.buyerLegalName || invoice.user?.name || invoice.user?.email,
            invoice.buyerAddressLine1,
            invoice.buyerAddressLine2,
            [invoice.buyerCity, invoice.buyerState, invoice.buyerPincode]
              .filter(Boolean)
              .join(', '),
            invoice.buyerGstin ? `GSTIN: ${invoice.buyerGstin}` : undefined,
          ]
            .filter(Boolean)
            .map((line) => line as string);

          doc
            .fontSize(12)
            .text('Bill To:', { underline: true })
            .fontSize(10)
            .text(buyerLines.join('\n'));
          doc.moveDown();
        }

        // Items table header
        doc
          .fontSize(10)
          .moveDown()
          .text('Items:', { underline: true })
          .moveDown(0.5);

        // Table header
        const tableTop = doc.y;
        doc
          .fontSize(9)
          .text('Description', 50, tableTop)
          .text('HSN', 250, tableTop)
          .text('Qty', 300, tableTop)
          .text('Rate', 340, tableTop)
          .text('Amount', 400, tableTop)
          .text('Tax %', 460, tableTop)
          .text('Tax Amt', 510, tableTop)
          .moveDown(0.5);

        // Draw line
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

        // Items
        let yPosition = doc.y + 5;
        const items = invoice.invoiceItems || invoice.items || [];
        items.forEach((item: any) => {
          doc
            .fontSize(9)
            .text(item.description.substring(0, 30), 50, yPosition)
            .text(item.hsnCode || '-', 250, yPosition)
            .text(item.quantity.toString(), 300, yPosition)
            .text(`₹${item.unitPrice.toFixed(2)}`, 340, yPosition)
            .text(`₹${item.totalPrice.toFixed(2)}`, 400, yPosition)
            .text(`${item.taxRate}%`, 460, yPosition)
            .text(`₹${item.taxAmount.toFixed(2)}`, 510, yPosition);

          yPosition += 20;

          // Page break if needed
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }
        });

        doc.moveDown(2);

        // Totals section
        const totalsY = doc.y;
        doc
          .fontSize(10)
          .text('Subtotal:', 400, totalsY)
          .text(`₹${invoice.amount.toFixed(2)}`, 500, totalsY, { align: 'right' })
          .text('Tax (GST):', 400, totalsY + 20)
          .text(`₹${invoice.taxAmount.toFixed(2)}`, 500, totalsY + 20, { align: 'right' })
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Total:', 400, totalsY + 40)
          .text(`₹${invoice.totalAmount.toFixed(2)}`, 500, totalsY + 40, { align: 'right' })
          .font('Helvetica');

        // GST breakdown
        doc.moveDown(2);
        doc
          .fontSize(9)
          .text('GST Breakdown:', { underline: true })
          .moveDown(0.5);

        // Calculate GST type (simplified - in production, use actual GST service)
        if (invoice.gstType === 'IGST') {
          doc.text(`IGST: ₹${invoice.igstAmount.toFixed(2)}`);
        } else {
          doc.text(`CGST: ₹${invoice.cgstAmount.toFixed(2)}`);
          doc.text(`SGST: ₹${invoice.sgstAmount.toFixed(2)}`);
        }

        // Footer
        doc
          .fontSize(8)
          .text('This is a computer-generated invoice.', 50, 750, { align: 'center' })
          .text('Thank you for your business!', 50, 765, { align: 'center' });

        // Finalize PDF
        doc.end();
      } catch (error) {
        this.logger.error('Error generating invoice PDF', error);
        reject(error);
      }
    });
  }
}
