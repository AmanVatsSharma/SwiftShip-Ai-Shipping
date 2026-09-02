import { ObjectType, Field, Int } from '@nestjs/graphql';
import { Role } from '../role.entity';

/**
 * GraphQL `User` object type — ported from the legacy
 * `src/users/entities/user.entity.ts` as part of the src-to-libs
 * decommission (STATUS.md §3). The persistence shape is `UserEntity`
 * in `@swiftship/platform-typeorm`.
 */
@ObjectType()
export class User {
  @Field(() => Int)
  id!: number;

  @Field()
  email!: string;

  @Field({ nullable: true })
  name?: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => [Role], { nullable: 'itemsAndList' })
  roles?: Role[];
}
