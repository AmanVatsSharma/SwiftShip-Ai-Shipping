import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * SS-028 — GraphQL surface for the audit log.
 *
 * Mirrors `AuditLogEntity` 1:1 so the schema is a true projection of
 * the table and there is no per-field translation to maintain.
 *
 * The `before` / `after` fields are exposed as `String` (JSON-encoded)
 * to keep the schema free of an optional `graphql-type-json` dep; the
 * client can `JSON.parse(...)` to inspect. This is the same shape
 * Postman's auto-generated GraphQL explorer renders.
 */
@ObjectType('AuditEvent')
export class AuditEventGql {
  @Field(() => ID)
  id!: number;

  @Field(() => ID, { nullable: true })
  tenantId?: number;

  @Field(() => ID, { nullable: true })
  actorUserId?: number;

  @Field()
  actorType!: string;

  @Field()
  action!: string;

  @Field()
  resourceType!: string;

  @Field({ nullable: true })
  resourceId?: string;

  @Field(() => String, { nullable: true, description: 'JSON snapshot before the mutation.' })
  before?: any;

  @Field(() => String, { nullable: true, description: 'JSON snapshot after the mutation.' })
  after?: any;

  @Field({ nullable: true })
  ipAddress?: string;

  @Field({ nullable: true })
  userAgent?: string;

  @Field({ nullable: true })
  correlationId?: string;

  @Field()
  createdAt!: Date;
}
