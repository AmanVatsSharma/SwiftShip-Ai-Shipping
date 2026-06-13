import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Tenant')
export class Tenant {
  @Field(() => ID)
  id!: number;

  @Field()
  slug!: string;

  @Field()
  name!: string;

  @Field()
  status!: string;

  @Field()
  tier!: string;

  @Field(() => String, { nullable: true })
  settings?: Record<string, unknown> | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType('TenantMember')
export class TenantMember {
  @Field(() => ID)
  id!: number;

  @Field(() => ID)
  tenantId!: number;

  @Field(() => ID)
  userId!: number;

  @Field()
  role!: string;

  @Field()
  isPrimary!: boolean;

  @Field()
  createdAt!: Date;
}
