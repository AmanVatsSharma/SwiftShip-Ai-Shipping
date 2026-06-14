import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class OnboardTenantInput {
  @Field()
  name!: string;

  @Field()
  email!: string;

  @Field()
  password!: string;

  @Field({ nullable: true })
  contactPhone?: string;

  @Field({ nullable: true })
  gstin?: string;
}

@InputType()
export class InviteTeamMemberInput {
  @Field(() => ID)
  tenantId!: number;

  @Field()
  email!: string;

  @Field({ defaultValue: 'MEMBER' })
  role!: string;
}

@InputType()
export class SubAccountInput {
  @Field()
  name!: string;

  @Field()
  email!: string;

  @Field({ nullable: true })
  contactPhone?: string;
}
