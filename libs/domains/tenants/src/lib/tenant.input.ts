import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class CreateTenantInput {
  @Field()
  slug!: string;

  @Field()
  name!: string;

  @Field({ nullable: true, defaultValue: 'STARTER' })
  tier?: string;

  @Field({ nullable: true, defaultValue: 'TRIAL' })
  status?: string;

  @Field(() => String, { nullable: true })
  settings?: Record<string, unknown>;
}

@InputType()
export class UpdateTenantInput {
  @Field(() => ID)
  id!: number;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  tier?: string;

  @Field({ nullable: true })
  status?: string;

  @Field(() => String, { nullable: true })
  settings?: Record<string, unknown>;
}

@InputType()
export class AssignRoleInput {
  @Field(() => ID)
  tenantId!: number;

  @Field(() => ID)
  userId!: number;

  @Field()
  role!: string;
}
