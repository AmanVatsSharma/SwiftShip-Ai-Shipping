import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OnboardingStatus } from '../enums';

/**
 * User — the global account record. Identity, credentials, billing link,
 * and reverse relations to orders / payments / subscriptions / refresh tokens.
 *
 * Original Prisma fields preserved 1:1; relations and indexes match
 * `prisma/schema.prisma` so data migrated out of the old DB lands cleanly.
 */
@Entity('users')
@Index('users_email_key', ['email'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password?: string | null;

  @Column({ type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ type: 'int', default: 1 })
  @Index('idx_users_tenantId')
  tenantId!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpires?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordResetToken?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpires?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToMany(() => RoleEntity, (r) => r.users)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'roleId', referencedColumnName: 'id' },
  })
  roles?: RoleEntity[];

  @OneToOne(() => OnboardingStateEntity, (s) => s.user)
  onboarding?: OnboardingStateEntity | null;

  @OneToMany(() => OrderEntity, (o) => o.user)
  orders?: OrderEntity[];

  @OneToMany(() => WebhookSubscriptionEntity, (w) => w.user)
  webhookSubscriptions?: WebhookSubscriptionEntity[];

  @OneToMany(() => PaymentEntity, (p) => p.user)
  payments?: PaymentEntity[];

  @OneToOne(() => SubscriptionEntity, (s) => s.user)
  subscription?: SubscriptionEntity | null;

  @OneToMany(() => InvoiceEntity, (i) => i.user)
  invoices?: InvoiceEntity[];

  @OneToMany(() => WooCommerceStoreEntity, (w) => w.user)
  wooCommerceStores?: WooCommerceStoreEntity[];

  @OneToMany(() => RefreshTokenEntity, (r) => r.user)
  refreshTokens?: RefreshTokenEntity[];

  @OneToMany(() => WarehouseSellerProfileEntity, (p) => p.user)
  sellerProfiles?: WarehouseSellerProfileEntity[];
}

@Entity('roles')
@Index('roles_name_key', ['name'], { unique: true })
export class RoleEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @ManyToMany(() => UserEntity, (u) => u.roles)
  users?: UserEntity[];
}

@Entity('onboarding_states')
@Index('onboarding_userId_key', ['userId'], { unique: true })
export class OnboardingStateEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @OneToOne(() => UserEntity, (u) => u.onboarding, { onDelete: 'CASCADE' })
  user?: UserEntity;

  @Column({
    type: 'enum',
    enum: OnboardingStatus,
    default: OnboardingStatus.NOT_STARTED,
  })
  status!: OnboardingStatus;

  @Column({ type: 'boolean', default: false })
  kycSubmitted!: boolean;

  @Column({ type: 'boolean', default: false })
  kycApproved!: boolean;

  @Column({ type: 'boolean', default: false })
  pickupAddressAdded!: boolean;

  @Column({ type: 'boolean', default: false })
  pickupVerified!: boolean;

  @Column({ type: 'boolean', default: false })
  carrierConnected!: boolean;

  @Column({ type: 'boolean', default: false })
  ecommerceConnected!: boolean;

  @Column({ type: 'boolean', default: false })
  paymentsConfigured!: boolean;

  @Column({ type: 'boolean', default: false })
  testLabelGenerated!: boolean;

  @Column({ type: 'boolean', default: false })
  firstPickupScheduled!: boolean;

  @Column({ type: 'int', default: 1 })
  @Index('idx_onboarding_states_tenantId')
  tenantId!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nextAction?: string | null;

  @Column({ type: 'text', nullable: true })
  blockedReason?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('refresh_tokens')
@Index('refresh_tokens_token_key', ['token'], { unique: true })
@Index('refresh_tokens_userId_idx', ['userId'])
@Index('refresh_tokens_expiresAt_idx', ['expiresAt'])
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => UserEntity, (u) => u.refreshTokens, { onDelete: 'CASCADE' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 512 })
  token!: string;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date | null;
}

// Imports of forward-referenced entities (avoid circular import)
import { OrderEntity } from './commerce.entities';
import {
  PaymentEntity,
  SubscriptionEntity,
  InvoiceEntity,
} from './billing.entities';
import {
  WebhookSubscriptionEntity,
  WooCommerceStoreEntity,
} from './ecom.entities';
import { WarehouseSellerProfileEntity } from './warehouse.entities';
