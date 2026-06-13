import { Field, Float, InputType, Int } from '@nestjs/graphql';

@InputType()
export class CreateRateSurchargeInput {
  @Field(() => Int)
  carrierId: number;
  @Field()
  name: string;
  @Field(() => Float, { nullable: true })
  percent?: number;
  @Field(() => Float, { nullable: true })
  flat?: number;
}
