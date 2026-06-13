import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class SchedulePickupInput {
  @Field(() => Int)
  shipmentId: number;

  @Field()
  scheduledAt: Date;
}
