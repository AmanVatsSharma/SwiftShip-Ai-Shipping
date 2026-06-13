import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class CreateLabelInput {
  @Field(() => Int)
  shipmentId: number;

  @Field({ description: 'Desired label format (PDF/ZPL)', nullable: true })
  format?: string;
}
