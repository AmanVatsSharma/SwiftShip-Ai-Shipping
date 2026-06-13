import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class RateSurchargeModel {
  @Field(() => Int)
  id: number;
  @Field(() => Int)
  carrierId: number;
  @Field()
  name: string;
  @Field(() => Float, { nullable: true })
  percent?: number | null;
  @Field(() => Float, { nullable: true })
  flat?: number | null;
  @Field()
  active: boolean;
}
