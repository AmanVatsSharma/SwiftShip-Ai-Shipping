import { ObjectType, Field, Int } from '@nestjs/graphql';

/**
 * Bulk Operation Result
 */
@ObjectType()
export class BulkOperationResult {
  @Field(() => Int)
  total: number;

  @Field(() => Int)
  successful: number;

  @Field(() => Int)
  failed: number;

  @Field(() => [Int], { nullable: true })
  successfulIds?: number[];

  @Field(() => [Int], { nullable: true })
  failedIds?: number[];

  @Field(() => [String], { nullable: true })
  errors?: string[];
}

/**
 * Bulk Label Generation Result
 */
@ObjectType()
export class BulkLabelResult extends BulkOperationResult {
  @Field(() => String, { nullable: true })
  manifestUrl?: string;

  @Field(() => [String], { nullable: true })
  labelUrls?: string[];
}
