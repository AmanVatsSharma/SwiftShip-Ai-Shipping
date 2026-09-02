import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Tenant } from './tenant.model';

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

  @Field(() => Date, { nullable: true })
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

  @Field(() => String, { nullable: true })
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
  @Field(() => Tenant)
  tenant!: Tenant;

  @Field(() => OnboardingUser)
  user!: OnboardingUser;

  @Field(() => OnboardingApiKey)
  apiKey!: OnboardingApiKey;
}
