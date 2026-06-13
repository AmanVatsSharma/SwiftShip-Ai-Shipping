import { InputType, Field, Int, Float } from '@nestjs/graphql';

/**
 * Input for generating an E-way bill
 * 
 * E-way bill is required for inter-state and intra-state movement of goods
 * in India when the value exceeds ₹50,000.
 */
@InputType()
export class GenerateEwayBillInput {
  @Field(() => String, {
    description: 'Linked invoice ID (prefill values from invoice)',
    nullable: true,
  })
  invoiceId?: string;

  @Field(() => Int, { description: 'Shipment ID' })
  shipmentId: number;

  @Field(() => String, { description: 'GSTIN of consignor (seller)' })
  consignorGstin: string;

  @Field(() => String, { description: 'GSTIN of consignee (buyer)' })
  consigneeGstin: string;

  @Field(() => String, { description: 'Place of dispatch' })
  placeOfDispatch: string;

  @Field(() => String, { description: 'Place of delivery' })
  placeOfDelivery: string;

  @Field(() => Float, { description: 'Invoice value' })
  invoiceValue: number;

  @Field(() => String, { description: 'Invoice number' })
  invoiceNumber: string;

  @Field(() => Date, { description: 'Invoice date' })
  invoiceDate: Date;

  @Field(() => String, { description: 'HSN code of main item' })
  hsnCode: string;

  @Field(() => String, { description: 'Reason for transportation', nullable: true })
  reason?: string;

  @Field(() => String, { description: 'Transporter ID (optional)', nullable: true })
  transporterId?: string;

  @Field(() => String, { description: 'Vehicle number (optional)', nullable: true })
  vehicleNumber?: string;
}
