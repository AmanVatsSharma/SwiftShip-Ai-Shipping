import { InputType, Field, Int } from '@nestjs/graphql';

/**
 * Input for batch order processing
 */
@InputType()
export class BatchOrderProcessingInput {
  @Field(() => [Int], { description: 'Array of order IDs to process' })
  orderIds: number[];

  @Field(() => Int, { description: 'Carrier ID to use for all orders', nullable: true })
  carrierId?: number;

  @Field(() => Boolean, { description: 'Auto-generate labels', defaultValue: false })
  autoGenerateLabels?: boolean;
}
