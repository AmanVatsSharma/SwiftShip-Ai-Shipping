import { Field, Float, InputType, Int } from '@nestjs/graphql';

@InputType()
export class UpdateRateSurchargeInput {
  @Field(() => Int)
  id: number;
  @Field({ nullable: true })
  name?: string;
  @Field(() => Float, { nullable: true })
  percent?: number;
  @Field(() => Float, { nullable: true })
  flat?: number;
  @Field({ nullable: true })
  active?: boolean;
}
