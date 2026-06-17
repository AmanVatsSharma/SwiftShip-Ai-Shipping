/**
 * SS-026 — channel-sync TypeORM entities.
 *
 * The decorated entity classes live here so the platform/typeorm lib
 * (which compiles before any domain lib) can register them in the
 * DataSource without depending on a domain lib (which would violate
 * the 5 dependency rules).
 *
 * The runtime TypeScript types (ChannelPlatform, ChannelConnectionStatus,
 * etc.) are defined in the channels domain lib
 * (libs/domains/channels/src/lib/sync/channel-sync.types.ts) and are
 * mirrored here as `string` columns so that TypeORM doesn't need a
 * runtime dependency on the channels lib. The Postgres CHECK
 * constraint in the migration enforces the actual allowed values.
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'channel_connections' })
@Index('idx_channel_connections_tenant', ['tenantId'])
@Index('idx_channel_connections_status', ['status'])
@Index('uq_channel_connections_tenant_platform_ext', ['tenantId', 'platform', 'externalAccountId'], { unique: true })
export class ChannelConnectionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  tenantId!: number;

  @Column({ type: 'varchar', length: 32 })
  platform!: string;

  @Column({ type: 'varchar', length: 200 })
  displayName!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  externalAccountId?: string | null;

  // AES-256-GCM ciphertext: base64(iv || tag || ciphertext)
  @Column({ type: 'text' })
  credentials!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  productCursor?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  orderCursor?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastProductSyncAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastOrderSyncAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity({ name: 'channel_sync_jobs' })
@Index('idx_channel_sync_jobs_tenant', ['tenantId'])
@Index('idx_channel_sync_jobs_channel', ['channelId'])
@Index('idx_channel_sync_jobs_status', ['status'])
@Index('uq_channel_sync_jobs_idempotency', ['idempotencyKey'], { unique: true })
export class ChannelSyncJobEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  tenantId!: number;

  @Column({ type: 'integer' })
  channelId!: number;

  @Column({ type: 'varchar', length: 16 })
  type!: string;

  @Column({ type: 'varchar', length: 16, default: 'queued' })
  status!: string;

  // sha256(tenant|channel|type|externalId|bucket) - one job per sync window per external id
  @Column({ type: 'varchar', length: 128 })
  idempotencyKey!: string;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'integer', default: 0 })
  itemsProcessed!: number;

  @Column({ type: 'integer', default: 0 })
  itemsCreated!: number;

  @Column({ type: 'integer', default: 0 })
  itemsUpdated!: number;

  @Column({ type: 'integer', default: 0 })
  itemsSkipped!: number;

  @Column({ type: 'integer', default: 0 })
  itemsFailed!: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  processedExternalIds!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}