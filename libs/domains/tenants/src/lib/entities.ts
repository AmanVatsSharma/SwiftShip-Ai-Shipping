import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  TenantMemberRole,
  TenantStatus,
  TenantTier,
} from './enums';
import { WalletEntity } from './wallet.entity';

@Entity('tenants')
@Index('idx_tenants_slug', ['slug'], { unique: true })
export class TenantEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  slug!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', length: 16, default: 'TRIAL' })
  status!: TenantStatus;

  @Column({ type: 'varchar', length: 16, default: 'STARTER' })
  tier!: TenantTier;

  @Column({ type: 'jsonb', default: {} })
  settings!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => TenantMemberEntity, (m) => m.tenant)
  members!: TenantMemberEntity[];

  @OneToMany(() => TenantApiKeyEntity, (k) => k.tenant)
  apiKeys!: TenantApiKeyEntity[];

  @OneToMany(() => TenantFeatureFlagEntity, (f) => f.tenant)
  featureFlags!: TenantFeatureFlagEntity[];

  @OneToMany(() => TenantRoleEntity, (r) => r.tenant)
  roles!: TenantRoleEntity[];

  @OneToOne(() => WalletEntity, (w) => w.tenant)
  wallet!: WalletEntity | null;
}

@Entity('tenant_members')
@Index('idx_tenant_members_tenant_id', ['tenantId'])
export class TenantMemberEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  tenantId!: number;

  @ManyToOne(() => TenantEntity, (t) => t.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant!: TenantEntity;

  @Column()
  userId!: number;

  @Column({ type: 'varchar', length: 16, default: 'MEMBER' })
  role!: TenantMemberRole;

  @Column({ default: false })
  isPrimary!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('tenant_roles')
@Index('idx_tenant_roles_tenant_id', ['tenantId'])
export class TenantRoleEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  tenantId!: number;

  @ManyToOne(() => TenantEntity, (t) => t.roles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant!: TenantEntity;

  @Column()
  name!: string;

  @Column({ type: 'jsonb', default: {} })
  permissions!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('tenant_feature_flags')
@Index('idx_tenant_feature_flags_tenant_id', ['tenantId'])
export class TenantFeatureFlagEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  tenantId!: number;

  @ManyToOne(() => TenantEntity, (t) => t.featureFlags, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenantId' })
  tenant!: TenantEntity;

  @Column()
  key!: string;

  @Column({ type: 'jsonb', default: {} })
  value!: Record<string, unknown>;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('tenant_api_keys')
@Index('idx_tenant_api_keys_prefix', ['prefix'], { unique: true })
export class TenantApiKeyEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  tenantId!: number;

  @ManyToOne(() => TenantEntity, (t) => t.apiKeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant!: TenantEntity;

  @Column()
  prefix!: string;

  @Column()
  hashedKey!: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
