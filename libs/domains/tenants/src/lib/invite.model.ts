import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Invite')
export class Invite {
  @Field(() => ID)
  id!: number;

  @Field(() => ID)
  tenantId!: number;

  @Field()
  email!: string;

  @Field()
  role!: string;

  @Field()
  expiresAt!: Date;

  @Field({ nullable: true })
  acceptedAt?: Date | null;

  @Field()
  createdAt!: Date;
}

@ObjectType('ApiKey')
export class ApiKey {
  @Field(() => ID)
  id!: number;

  @Field(() => ID)
  tenantId!: number;

  @Field()
  prefix!: string;

  @Field()
  createdAt!: Date;
}

@ObjectType('OnboardingUser')
export class OnboardingUser {
  @Field(() => ID)
  id!: number;

  @Field()
  email!: string;

  @Field({ nullable: true })
  name?: string | null;
}

@ObjectType('OnboardingApiKey')
export class OnboardingApiKey {
  @Field()
  prefix!: string;

  @Field()
  plainText!: string;
}

@ObjectType('OnboardingResult')
export class OnboardingResult {
  @Field()
  tenant!: import('./tenant.model').Tenant;

  @Field(() => OnboardingUser)
  user!: OnboardingUser;

  @Field(() => OnboardingApiKey)
  apiKey!: OnboardingApiKey;
}
