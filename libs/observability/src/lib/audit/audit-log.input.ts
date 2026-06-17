import { Field, InputType, Int } from '@nestjs/graphql';

/**
 * SS-028 — GraphQL input for the `auditEvents` query.
 *
 * `tenantId` is required (every audit row is scoped to a tenant).
 * `limit` is bounded server-side at 200.
 */
@InputType()
export class AuditLogFilterInput {
  @Field(() => Int, { nullable: true })
  actorUserId?: number;

  @Field({ nullable: true })
  action?: string;

  @Field({ nullable: true })
  resourceType?: string;

  @Field({ nullable: true })
  resourceId?: string;

  @Field({ nullable: true })
  since?: Date;

  @Field({ nullable: true })
  until?: Date;

  @Field(() => Int, { nullable: true, defaultValue: 50 })
  limit?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  offset?: number;
}
