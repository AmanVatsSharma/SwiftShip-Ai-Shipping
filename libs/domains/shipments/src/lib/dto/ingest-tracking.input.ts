import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class IngestTrackingInput {
  @Field(() => Int)
  shipmentId: number;

  @Field()
  trackingNumber: string;

  @Field()
  status: string;

  @Field({ nullable: true })
  subStatus?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  eventCode?: string;

  @Field({ nullable: true })
  location?: string;

  @Field()
  occurredAt: Date;

  @Field({ nullable: true, description: 'JSON string for raw payload' })
  rawJson?: string;
}
