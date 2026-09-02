import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class UserAuth {
  @Field(() => Int)
  id!: number;

  @Field()
  email!: string;

  @Field({ nullable: true })
  name?: string;

  @Field()
  emailVerified!: boolean;

  @Field()
  createdAt!: Date;

  /** Role NAMES (e.g. ["admin"]) — the auth payload carries no role ids. */
  @Field(() => [String], { nullable: 'itemsAndList' })
  roles?: string[];
}

@ObjectType()
export class AuthPayload {
  @Field()
  accessToken!: string;

  @Field()
  refreshToken!: string;

  @Field(() => UserAuth, { nullable: true })
  user?: UserAuth;

  @Field({ nullable: true })
  emailVerificationToken?: string;
}

@ObjectType()
export class MessageResponse {
  @Field()
  message!: string;

  @Field({ nullable: true })
  resetToken?: string;

  @Field({ nullable: true })
  verificationToken?: string;
}
