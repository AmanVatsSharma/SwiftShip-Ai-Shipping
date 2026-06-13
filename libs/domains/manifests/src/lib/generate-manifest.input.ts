import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class GenerateManifestInput {
  @Field(() => [Int])
  shipmentIds: number[];
}
