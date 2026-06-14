import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TenantMemberRole } from './enums';

/**
 * Tenant invite — opaque token, single-use, 7-day TTL.
 *
 * SS-005: created by `OnboardingService.inviteTeamMember`, consumed by
 * `acceptInvite` which promotes the token to a TenantMemberEntity row.
 */
@Entity('tenant_invites')
@Index('idx_invite_token', ['token'], { unique: true })
export class InviteEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  tenantId!: number;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: TenantMemberRole;

  @Column({ type: 'varchar', length: 80 })
  token!: string;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
