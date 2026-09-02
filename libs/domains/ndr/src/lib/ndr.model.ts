import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { NdrCaseStatus } from '@swiftship/platform-typeorm';

registerEnumType(NdrCaseStatus, {
  name: 'NdrCaseStatus',
  description: 'Lifecycle states for a Non-Delivery Report (NDR) case.',
});

@ObjectType('NdrCase', { description: 'A non-delivery report for a shipment.' })
export class NdrCase {
  @Field(() => Int) id!: number;
  @Field(() => Int) shipmentId!: number;
  @Field(() => Int) tenantId!: number;
  @Field(() => NdrCaseStatus) status!: NdrCaseStatus;

  @Field(() => String, { nullable: true }) awbNumber?: string | null;
  @Field(() => String, { nullable: true }) courierName?: string | null;
  @Field(() => String, { nullable: true }) customerPhone?: string | null;
  @Field(() => String, { nullable: true }) customerEmail?: string | null;
  @Field(() => String, { nullable: true }) customerName?: string | null;

  @Field(() => String, { nullable: true }) ndrReason?: string | null;
  @Field(() => String, { nullable: true }) reason?: string | null;
  @Field(() => String, { nullable: true }) actionNotes?: string | null;

  @Field(() => Int) attemptCount!: number;

  @Field(() => String, { nullable: true }) firstAttemptAt?: Date | null;
  @Field(() => String, { nullable: true }) lastAttemptAt?: Date | null;
  @Field(() => String, { nullable: true }) resolvedAt?: Date | null;

  @Field(() => String, { nullable: true }) metadata?: Record<string, any> | null;

  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType('NdrCaseList', { description: 'Paged NDR cases (reserved).' })
export class NdrCaseList {
  @Field(() => [NdrCase]) items!: NdrCase[];
  @Field(() => Int) total!: number;
}
