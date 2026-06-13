import { Query, Resolver } from '@nestjs/graphql';
import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class HealthInfo {
  @Field()
  status: string;

  @Field()
  name: string;

  @Field()
  uptime: string;
}

@Resolver(() => HealthInfo)
export class AppResolver {
  @Query(() => HealthInfo, { name: 'apiInfo' })
  info(): HealthInfo {
    return {
      status: 'ok',
      name: 'SwiftShip AI',
      uptime: `${process.uptime().toFixed(1)}s`,
    };
  }
}
