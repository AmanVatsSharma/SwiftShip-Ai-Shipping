import { join } from 'path';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import type { DynamicModule } from '@nestjs/common';

/**
 * Shared Apollo / GraphQL configuration used by the API app.
 *
 * Code-first schema generation: the SDL is emitted to `src/schema.graphql`
 * (resolved relative to the API app's working directory at boot).
 */
export const graphQLConfig: DynamicModule = GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: join(process.cwd(), 'src/schema.graphql'),
  playground: process.env.NODE_ENV !== 'production',
  context: ({ req }: { req: any }) => ({ req }),
});
