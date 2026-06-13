import { ObjectType, Field, Int, Float } from '@nestjs/graphql';
import { Warehouse } from '../warehouses/warehouse.model';
import { WarehouseSellerProfile } from '../warehouses/seller-profile.model';
import { Payment } from '../payments/payment.model';

/**
 * Invoice Item GraphQL Model
 */
@ObjectType()
export class InvoiceItem {
  @Field(() => Int)
  id: number;

  @Field(() => String)
  invoiceId: string;

  @Field(() => String)
  description: string;

  @Field(() => Int)
  quantity: number;

  @Field(() => Float)
  unitPrice: number;

  @Field(() => Float)
  totalPrice: number;

  @Field(() => String, { nullable: true })
  hsnCode?: string;

  @Field(() => Float)
  taxRate: number;

  @Field(() => Float)
  taxAmount: number;

  @Field(() => Float)
  cgstAmount: number;

  @Field(() => Float)
  sgstAmount: number;

  @Field(() => Float)
  igstAmount: number;

  @Field(() => String, { nullable: true })
  gstType?: string;

  @Field(() => Date)
  createdAt: Date;
}

/**
 * Invoice GraphQL Model
 */
@ObjectType()
export class Invoice {
  @Field(() => String)
  id: string;

  @Field(() => String)
  invoiceNumber: string;

  @Field(() => Int)
  userId: number;

  @Field(() => Int, { nullable: true })
  warehouseId?: number;

  @Field(() => Int, { nullable: true })
  sellerProfileId?: number;

  @Field(() => String, { nullable: true })
  subscriptionId?: string;

  @Field(() => Float)
  amount: number;

  @Field(() => Float)
  taxAmount: number;

  @Field(() => Float)
  cgstAmount: number;

  @Field(() => Float)
  sgstAmount: number;

  @Field(() => Float)
  igstAmount: number;

  @Field(() => String, { nullable: true })
  gstType?: string;

  @Field(() => Float)
  totalAmount: number;

  @Field(() => String)
  currency: string;

  @Field(() => String)
  status: string;

  @Field(() => Int, { nullable: true })
  sequenceNumber?: number;

  @Field(() => String, { nullable: true })
  financialYear?: string;

  @Field(() => Date, { nullable: true })
  dueDate?: Date;

  @Field(() => Date, { nullable: true })
  paidAt?: Date;

  @Field(() => String, { nullable: true })
  invoiceUrl?: string;

  @Field(() => String, { nullable: true })
  pdfStorageKey?: string;

  @Field(() => String, { nullable: true })
  buyerLegalName?: string;

  @Field(() => String, { nullable: true })
  buyerGstin?: string;

  @Field(() => String, { nullable: true })
  buyerState?: string;

  @Field(() => String, { nullable: true })
  buyerEmail?: string;

  @Field(() => String, { nullable: true })
  buyerPhone?: string;

  @Field(() => String, { nullable: true })
  buyerAddressLine1?: string;

  @Field(() => String, { nullable: true })
  buyerAddressLine2?: string;

  @Field(() => String, { nullable: true })
  buyerCity?: string;

  @Field(() => String, { nullable: true })
  buyerPincode?: string;

  @Field(() => String, { nullable: true })
  buyerCountry?: string;

  @Field(() => String, { nullable: true })
  gstnAckNumber?: string;

  @Field(() => Date, { nullable: true })
  gstnAckDate?: Date;

  @Field(() => String, { nullable: true })
  gstnSignedPayload?: string;

  @Field(() => Boolean, { nullable: true })
  gstnSignatureValid?: boolean;

  @Field(() => String)
  emailDeliveryStatus: string;

  @Field(() => Int)
  emailDeliveryAttempts: number;

  @Field(() => Date, { nullable: true })
  emailDeliveredAt?: Date;

  @Field(() => [InvoiceItem], { name: 'items' })
  invoiceItems: InvoiceItem[];

  @Field(() => Warehouse, { nullable: true })
  warehouse?: Warehouse;

  @Field(() => WarehouseSellerProfile, { nullable: true })
  sellerProfile?: WarehouseSellerProfile;

  @Field(() => [Payment], { nullable: true })
  payments?: Payment[];

  @Field(() => EwayBill, { nullable: true })
  ewayBill?: EwayBill;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}

/**
 * E-way Bill GraphQL Model
 */
@ObjectType()
export class EwayBill {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  shipmentId: number;

  @Field(() => String)
  ewayBillNumber: string;

  @Field(() => String)
  status: string;

  @Field(() => Date, { nullable: true })
  validUntil?: Date;

  @Field(() => String, { nullable: true })
  ewayBillUrl?: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}

/**
 * GST Calculation Result
 */
@ObjectType()
export class GstCalculation {
  @Field(() => Float)
  baseAmount: number;

  @Field(() => Float)
  cgst: number; // Central GST

  @Field(() => Float)
  sgst: number; // State GST

  @Field(() => Float)
  igst: number; // Integrated GST (for inter-state)

  @Field(() => Float)
  totalTax: number;

  @Field(() => Float)
  totalAmount: number;

  @Field(() => String)
  gstType: string; // 'CGST+SGST' for intra-state, 'IGST' for inter-state
}
