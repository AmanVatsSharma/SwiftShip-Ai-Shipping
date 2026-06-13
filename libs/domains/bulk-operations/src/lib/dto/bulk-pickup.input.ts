import { InputType, Field, Int } from '@nestjs/graphql';

/**
 * Input for bulk pickup scheduling
 */
@InputType()
export class BulkPickupInput {
  @Field(() => [Int], { description: 'Array of shipment IDs' })
  shipmentIds: number[];

  @Field(() => Date, { description: 'Scheduled pickup date and time' })
  scheduledAt: Date;
}
