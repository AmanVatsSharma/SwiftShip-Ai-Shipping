import { ObjectType, Field, Int } from '@nestjs/graphql';
import { Role } from './role.model';

@ObjectType()
export class UserAuth {
  @Field(() => Int)
  id: number;

  @Field()
  email: string;

  @Field({ nullable: true })
  name?: string;

  @Field()
  emailVerified: boolean;

  @Field()
  createdAt: Date;

  @Field(() => [Role], { nullable: 'itemsAndList' })
  roles?: Role[];
}

@ObjectType()
export class AuthPayload {
  @Field()
  accessToken: string;

  @Field()
  refreshToken: string;

  @Field(() => UserAuth)
  user: UserAuth;

  @Field({ nullable: true })
  emailVerificationToken?: string;
}

@ObjectType()
export class MessageResponse {
  @Field()
  message: string;

  @Field({ nullable: true })
  resetToken?: string;

  @Field({ nullable: true })
  verificationToken?: string;
}
