import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import type {
  ChannelConnectionStatus,
  ChannelPlatform,
  ChannelSettings,
  ChannelSyncStatus,
  ChannelSyncType,
} from './channel-sync.types';

/**
 * SS-026 — GraphQL model for `ChannelSyncService`.
 *
 * The classes in this file are the public GraphQL surface for
 * channel connections. The database entities are the source of
 * truth; these classes are the transport shape. Field names are
 * camelCase (GraphQL convention) and align with the entity columns
 * so the resolver can copy through 1:1.
 */
@ObjectType('ChannelConnection')
export class ChannelConnectionGraphQL {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  tenantId!: number;

  @Field()
  platform!: ChannelPlatform;

  @Field()
  displayName!: string;

  @Field()
  externalAccountId!: string;

  @Field()
  status!: ChannelConnectionStatus;

  @Field({ nullable: true })
  productCursor?: string | null;

  @Field({ nullable: true })
  orderCursor?: string | null;

  @Field({ nullable: true })
  lastProductSyncAt?: Date | null;

  @Field({ nullable: true })
  lastOrderSyncAt?: Date | null;

  @Field({ nullable: true })
  lastError?: string | null;

  @Field({ nullable: true })
  settings?: ChannelSettings | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType('ChannelSyncJob')
export class ChannelSyncJobGraphQL {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  tenantId!: number;

  @Field(() => Int)
  channelId!: number;

  @Field()
  type!: ChannelSyncType;

  @Field()
  status!: ChannelSyncStatus;

  @Field({ nullable: true })
  startedAt?: Date | null;

  @Field({ nullable: true })
  finishedAt?: Date | null;

  @Field(() => Int, { defaultValue: 0 })
  itemsProcessed!: number;

  @Field(() => Int, { defaultValue: 0 })
  itemsCreated!: number;

  @Field(() => Int, { defaultValue: 0 })
  itemsUpdated!: number;

  @Field(() => Int, { defaultValue: 0 })
  itemsSkipped!: number;

  @Field(() => Int, { defaultValue: 0 })
  itemsFailed!: number;

  @Field({ nullable: true })
  errorMessage?: string | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@InputType()
export class ConnectChannelInput {
  @Field()
  platform!: ChannelPlatform;

  @Field()
  displayName!: string;

  @Field()
  externalAccountId!: string;

  /**
   * Map of credential fields. We accept a free-form JSON string so the
   * per-platform adapter can pick whatever it needs. Stored encrypted.
   */
  @Field({ description: 'JSON string of per-platform credentials' })
  credentialsJson!: string;

  @Field({ nullable: true, description: 'JSON string of settings' })
  settingsJson?: string;
}
