import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { ChannelSyncService } from './channel-sync.service';
import {
  ChannelConnectionGraphQL,
  ChannelSyncJobGraphQL,
  ConnectChannelInput,
} from './channel-sync.model';
import type {
  ChannelConnectionEntity,
  ChannelSyncJobEntity,
} from './channel-sync.entities';
import type {
  ChannelConnectionStatus,
  ChannelPlatform,
  ChannelSyncStatus,
  ChannelSyncType,
} from './channel-sync.types';
import type { ChannelSettings } from './channel-sync.types';

/**
 * SS-026 — GraphQL resolver for `ChannelSyncService`.
 *
 * The resolver is intentionally thin: it marshals arguments, calls the
 * service, and maps entity rows → GraphQL DTOs. All business logic —
 * encryption, idempotency, paging, fan-out — lives in the service.
 */
@Resolver(() => ChannelConnectionGraphQL)
export class ChannelSyncResolver {
  constructor(private readonly service: ChannelSyncService) {}

  // -----------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------

  @Query(() => [ChannelConnectionGraphQL], {
    name: 'channelConnections',
    description: 'List all channel connections for the tenant.',
  })
  channelConnections(
    @Args('tenantId', { type: () => Int }) tenantId: number,
  ): Promise<ChannelConnectionGraphQL[]> {
    return this.service
      .listConnections(tenantId)
      .then((rows) => rows.map(toConnectionGql));
  }

  @Query(() => ChannelConnectionGraphQL, {
    name: 'channelConnection',
    description: 'Fetch a single channel connection by id.',
  })
  async channelConnection(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('channelId', { type: () => ID }) channelId: string,
  ): Promise<ChannelConnectionGraphQL> {
    const row = await this.service.getConnection(tenantId, Number(channelId));
    return toConnectionGql(row);
  }

  @Query(() => [ChannelSyncJobGraphQL], {
    name: 'channelSyncJobs',
    description: 'Recent sync jobs for a channel (optionally filtered by status).',
  })
  async channelSyncJobs(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('channelId', { type: () => ID }) channelId: string,
    @Args('status', { type: () => String, nullable: true })
    status?: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 })
    limit?: number,
  ): Promise<ChannelSyncJobGraphQL[]> {
    const jobs = await this.service.listJobs(
      tenantId,
      Number(channelId),
      (status as ChannelSyncJobEntity['status'] | undefined) ?? undefined,
      limit ?? 50,
    );
    return jobs.map(toJobGql);
  }

  // -----------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------

  @Mutation(() => ChannelConnectionGraphQL, {
    name: 'connectChannel',
    description:
      'Connect a new e-commerce platform. Validates credentials with `testConnection` before persisting.',
  })
  async connectChannel(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('input', { type: () => ConnectChannelInput })
    input: ConnectChannelInput,
  ): Promise<ChannelConnectionGraphQL> {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(input.credentialsJson);
    } catch {
      throw new Error('connectChannel: credentialsJson is not valid JSON');
    }
    let settings: Record<string, unknown> | undefined;
    if (input.settingsJson) {
      try {
        settings = JSON.parse(input.settingsJson);
      } catch {
        throw new Error('connectChannel: settingsJson is not valid JSON');
      }
    }
    const row = await this.service.connectChannel(tenantId, {
      platform: input.platform,
      displayName: input.displayName,
      externalAccountId: input.externalAccountId,
      credentials,
      settings,
    });
    return toConnectionGql(row);
  }

  @Mutation(() => ChannelConnectionGraphQL, {
    name: 'disconnectChannel',
    description: 'Soft-delete (disconnect) a channel connection.',
  })
  async disconnectChannel(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('channelId', { type: () => ID }) channelId: string,
  ): Promise<ChannelConnectionGraphQL> {
    const row = await this.service.disconnectChannel(
      tenantId,
      Number(channelId),
    );
    return toConnectionGql(row);
  }

  @Mutation(() => ChannelSyncJobGraphQL, {
    name: 'triggerChannelSync',
    description: 'Kick a sync immediately. Returns the sync job row.',
  })
  async triggerChannelSync(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('channelId', { type: () => ID }) channelId: string,
    @Args('type', { type: () => String })
    type: ChannelSyncType,
  ): Promise<ChannelSyncJobGraphQL> {
    const job = await this.service.triggerSync(tenantId, Number(channelId), type);
    return toJobGql(job);
  }

  @Mutation(() => ChannelConnectionGraphQL, {
    name: 'updateChannelSettings',
    description: 'Update per-connection settings (sync mode, conflict resolution, etc.).',
  })
  async updateChannelSettings(
    @Args('tenantId', { type: () => Int }) tenantId: number,
    @Args('channelId', { type: () => ID }) channelId: string,
    @Args('settingsJson', { type: () => String }) settingsJson: string,
  ): Promise<ChannelConnectionGraphQL> {
    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(settingsJson);
    } catch {
      throw new Error('updateChannelSettings: settingsJson is not valid JSON');
    }
    const row = await this.service.updateChannelSettings(
      tenantId,
      Number(channelId),
      settings,
    );
    return toConnectionGql(row);
  }
}

// -----------------------------------------------------------------
// Mappers
// -----------------------------------------------------------------

function toConnectionGql(
  row: ChannelConnectionEntity,
): ChannelConnectionGraphQL {
  return {
    id: String(row.id),
    tenantId: row.tenantId,
    platform: row.platform as ChannelPlatform,
    displayName: row.displayName,
    externalAccountId: row.externalAccountId ?? '',
    status: row.status as ChannelConnectionStatus,
    productCursor: row.productCursor,
    orderCursor: row.orderCursor,
    lastProductSyncAt: row.lastProductSyncAt,
    lastOrderSyncAt: row.lastOrderSyncAt,
    lastError: row.lastError,
    settings: (row.settings ?? {}) as ChannelSettings,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toJobGql(row: ChannelSyncJobEntity): ChannelSyncJobGraphQL {
  return {
    id: String(row.id),
    tenantId: row.tenantId,
    channelId: row.channelId,
    type: row.type as ChannelSyncType,
    status: row.status as ChannelSyncStatus,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    itemsProcessed: row.itemsProcessed,
    itemsCreated: row.itemsCreated,
    itemsUpdated: row.itemsUpdated,
    itemsSkipped: row.itemsSkipped,
    itemsFailed: row.itemsFailed,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}