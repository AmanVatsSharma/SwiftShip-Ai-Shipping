/**
 * SS-032 — GraphQL models for GST invoicing + E-way bill.
 *
 * Plain `@ObjectType` classes — schema is regenerated into
 * `apps/api/src/schema.graphql` on every API boot. Do not hand-edit
 * the schema file; change these classes.
 */
import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class GstInvoice {
  @Field(() => Int)
  id!: number;

  @Field(() => String)
  invoiceId!: string;

  @Field(() => Int)
  tenantId!: number;

  @Field(() => String)
  hsnCode!: string;

  @Field(() => String, { nullable: true })
  supplyDescription?: string | null;

  @Field(() => Float)
  taxableValue!: number;

  @Field(() => Float)
  taxRate!: number;

  @Field(() => Float)
  cgstAmount!: number;

  @Field(() => Float)
  sgstAmount!: number;

  @Field(() => Float)
  igstAmount!: number;

  @Field(() => Float)
  totalTax!: number;

  @Field(() => Float)
  totalAmount!: number;

  @Field(() => String)
  gstType!: string;

  @Field(() => String)
  supplierState!: string;

  @Field(() => String)
  placeOfSupply!: string;

  @Field(() => String, { nullable: true })
  supplierGstin?: string | null;

  @Field(() => String, { nullable: true })
  recipientGstin?: string | null;

  @Field(() => Boolean)
  isInterState!: boolean;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class GstEwayBill {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  shipmentId!: number;

  @Field(() => Int)
  tenantId!: number;

  @Field(() => String)
  ewbNo!: string;

  @Field(() => String)
  provider!: string;

  @Field(() => String)
  status!: string;

  @Field(() => Date)
  validFrom!: Date;

  @Field(() => Date)
  validTo!: Date;

  @Field(() => String, { nullable: true })
  vehicleNo?: string | null;

  @Field(() => String, { nullable: true })
  transporterId?: string | null;

  @Field(() => String, { nullable: true })
  transporterName?: string | null;

  @Field(() => String, { nullable: true })
  ewayBillUrl?: string | null;

  @Field(() => String, { nullable: true })
  providerRef?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

/**
 * Helper model that carries the result of "should I issue an E-way
 * bill?". Callers use it for client-side UX (showing the threshold
 * before the user submits a generation request).
 */
@ObjectType()
export class EwayBillThresholdCheck {
  @Field(() => Boolean)
  required!: boolean;

  @Field(() => Float)
  threshold!: number;

  @Field(() => Float)
  invoiceValue!: number;

  @Field(() => Boolean)
  isInterState!: boolean;

  @Field(() => String, { nullable: true })
  reason?: string | null;
}
