import { InputType, Field, Int } from '@nestjs/graphql';

/**
 * Input for bulk label generation
 */
@InputType()
export class BulkLabelGenerationInput {
  @Field(() => [Int], { description: 'Array of shipment IDs' })
  shipmentIds: number[];

  @Field(() => String, { description: 'Label format (PDF, ZPL)', defaultValue: 'PDF' })
  format?: string;
}
