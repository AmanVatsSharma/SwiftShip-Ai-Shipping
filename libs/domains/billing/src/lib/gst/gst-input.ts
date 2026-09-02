/**
 * SS-032 — GraphQL input DTOs for GST invoice + E-way bill.
 */
import { Field, Float, InputType, Int } from '@nestjs/graphql';

@InputType()
export class GenerateGstInvoiceInput {
  @Field(() => String)
  invoiceId!: string;

  @Field(() => String)
  hsnCode!: string;

  @Field(() => Float, { description: 'Taxable value (pre-tax) in INR.' })
  taxableValue!: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Optional override. If absent we look the HSN up in the rate table.',
  })
  taxRate?: number;

  @Field(() => String, { description: 'Supplier state (e.g. "Maharashtra").' })
  supplierState!: string;

  @Field(() => String, { description: 'Place of supply (recipient state).' })
  placeOfSupply!: string;

  @Field(() => String, { nullable: true })
  supplierGstin?: string;

  @Field(() => String, { nullable: true })
  recipientGstin?: string;

  @Field(() => String, { nullable: true })
  supplyDescription?: string;
}

@InputType()
export class GenerateEwayBillInput {
  @Field(() => Int)
  shipmentId!: number;

  @Field(() => String)
  supplierGstin!: string;

  @Field(() => String, { nullable: true })
  recipientGstin?: string;

  @Field(() => String)
  fromAddress!: string;

  @Field(() => String)
  toAddress!: string;

  @Field(() => Float)
  invoiceValue!: number;

  @Field(() => String, {
    nullable: true,
    description: 'Default 996811 ("postal / courier services", 18% slab).',
  })
  hsnCode?: string;

  @Field(() => String, { nullable: true })
  vehicleNo?: string;

  @Field(() => String, { nullable: true })
  transporterId?: string;

  @Field(() => String, { nullable: true })
  transporterName?: string;

  @Field(() => Float, { nullable: true })
  distanceKm?: number;
}
