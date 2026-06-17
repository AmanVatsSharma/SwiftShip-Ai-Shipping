/**
 * SS-026 — channel-sync TypeORM entities (domain barrel).
 *
 * The decorated entity classes are owned by the platform/typeorm lib
 * (libs/platform/typeorm/src/lib/entities/channel-sync.entities.ts)
 * because that lib owns the DataSource registration and must be
 * platform-only. This file re-exports them for the channels domain
 * service + resolver.
 *
 * The runtime type aliases (`ChannelPlatform`, `ChannelConnectionStatus`,
 * etc.) live in `./channel-sync.types.ts` — single source of truth.
 */
import { ChannelConnectionEntity, ChannelSyncJobEntity } from '@swiftship/platform-typeorm';

export { ChannelConnectionEntity, ChannelSyncJobEntity };
