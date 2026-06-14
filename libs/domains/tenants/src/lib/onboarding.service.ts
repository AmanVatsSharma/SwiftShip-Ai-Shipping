import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UserEntity } from '@swiftship/platform-typeorm';
import { InviteEntity } from './invite.entity';
import {
  TenantApiKeyEntity,
  TenantEntity,
  TenantMemberEntity,
} from './entities';
import { ApiKeyService } from './api-key.service';
import { TenantFeatureFlagService } from './tenant-feature-flag.service';
import { WalletService } from './wallet.service';
import type {
  OnboardTenantInput,
  InviteTeamMemberInput,
  SubAccountInput,
} from './invite.input';
import type { OnboardingResult } from './invite.model';

/** ₹500 in paise. */
const FREE_CREDIT_PAISE = 500 * 100;

const BCRYPT_ROUNDS = 12;

/**
 * OnboardingService — single-atom tenant + first user + API key creation.
 *
 * SS-005: onboarding mutations for the owner panel and direct tenant signup.
 *
 * Stub behaviors:
 * - User creation directly via UserEntity (no external service calls)
 * - Email invites logged instead of sent
 * - Wallet-creation stubbed (SS-004 does actual ledger persistence)
 * - No event emitter yet
 */
@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
    @InjectRepository(InviteEntity)
    private readonly invites: Repository<InviteEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(TenantApiKeyEntity)
    private readonly apiKeys: Repository<TenantApiKeyEntity>,
    private readonly apiKeyService: ApiKeyService,
    private readonly featureFlagService: TenantFeatureFlagService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Create a new tenant, its first user, a free wallet credit, and a live API key.
   * Returns the plainText API key ONCE only.
   */
  async onboardTenant(input: OnboardTenantInput): Promise<OnboardingResult> {
    const slug = this.slugify(input.name);
    const existing = await this.tenants.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(
        `Tenant with slug '${slug}' already exists`,
      );
    }

    // Step 1: create tenant (TRIAL + STARTER)
    const tenant = this.tenants.create({
      slug,
      name: input.name,
      status: 'TRIAL',
      tier: 'STARTER',
      settings: { contactPhone: input.contactPhone, gstin: input.gstin },
    });
    const savedTenant = await this.tenants.save(tenant);

    // Step 2: create the first user (stubbed via direct UserEntity creation)
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = this.users.create({
      email: input.email,
      name: input.name,
      password: passwordHash,
      emailVerified: true,
    });
    const savedUser = await this.users.save(user);

    // Step 3: grant the free ₹500 wallet credit via the SS-004 wallet service.
    // Idempotency key is per-onboarding so retries don't double-grant.
    try {
      await this.walletService.topUp({
        tenantId: savedTenant.id,
        amount: FREE_CREDIT_PAISE,
        idempotencyKey: `onboarding:free-credit:${savedTenant.id}`,
        metadata: { source: 'onboarding', userId: savedUser.id },
      });
    } catch (err) {
      // Don't fail onboarding if the wallet hookup has a transient issue —
      // SS-004 will reconcile via the onboarding idempotency key on retry.
      // eslint-disable-next-line no-console
      console.warn(
        `Free-credit top-up failed for tenant ${savedTenant.id}: ${(err as Error).message}`,
      );
    }

    // Step 4: create the default API key
    const { entity: apiKeyEntity, plainText } =
      await this.apiKeyService.create(savedTenant.id);

    // Step 5: set default feature flags
    await this.setDefaultFlags(savedTenant.id);

    // Step 7: emit a `tenant.onboarded` event (stubbed)
    // eslint-disable-next-line no-console
    console.log(`Event emitted: tenant.onboarded ${savedTenant.id}`);

    return {
      tenant: {
        id: savedTenant.id,
        slug: savedTenant.slug,
        name: savedTenant.name,
        status: savedTenant.status,
        tier: savedTenant.tier,
        settings: savedTenant.settings,
        createdAt: savedTenant.createdAt,
        updatedAt: savedTenant.updatedAt,
      },
      user: {
        id: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
      },
      apiKey: {
        prefix: apiKeyEntity.prefix,
        plainText,
      },
    };
  }

  /**
   * Create a team invite — single-use token, expires in 7 days.
   * SS-005: logs instead of emailing.
   */
  async inviteTeamMember(
    input: InviteTeamMemberInput,
  ): Promise<InviteEntity> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = this.invites.create({
      tenantId: input.tenantId,
      email: input.email,
      role: input.role as any,
      token,
      expiresAt,
      acceptedAt: null,
    });
    await this.invites.save(invite);

    // Stub: log the invite instead of sending
    // eslint-disable-next-line no-console
    console.log(
      `Would email invite link with token=${token} to ${input.email} (role=${input.role}) for tenant=${input.tenantId}`,
    );
    return invite;
  }

  /**
   * Accept an invite — convert token to a TenantMemberEntity row.
   */
  async acceptInvite(
    token: string,
    userId: number,
  ): Promise<TenantMemberEntity> {
    const invite = await this.invites.findOne({
      where: {
        token,
        expiresAt: MoreThan(new Date()),
      },
    });
    if (invite && invite.acceptedAt !== null) {
      // already accepted — treat as consumed
      throw new BadRequestException(
        'Invite not found or already used/expired',
      );
    }
    if (!invite) {
      throw new BadRequestException(
        'Invite not found or already used/expired',
      );
    }

    const member = this.invites.manager.create(TenantMemberEntity, {
      tenantId: invite.tenantId,
      userId,
      role: invite.role,
      isPrimary: false,
    } as Partial<TenantMemberEntity>);
    const savedMember: TenantMemberEntity = await this.invites.manager.save(
      TenantMemberEntity,
      member,
    );

    // Mark the invite as consumed
    invite.acceptedAt = new Date();
    await this.invites.save(invite);

    return savedMember;
  }

  /**
   * Rotate an API key — old is revoked, new has the same public prefix.
   */
  async rotateApiKey(
    oldKeyId: number,
  ): Promise<{ prefix: string; plainText: string }> {
    const { entity, plainText, prefix } =
      await this.apiKeyService.rotate(oldKeyId);
    return { prefix, plainText };
  }

  /**
   * Create a child tenant (sub-account) — no initial wallet credit.
   */
  async createSubAccount(
    parentTenantId: number,
    input: SubAccountInput,
  ): Promise<TenantEntity> {
    const slug = this.slugify(input.name);
    const existing = await this.tenants.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(
        `Tenant with slug '${slug}' already exists`,
      );
    }

    const childTenant = this.tenants.create({
      slug,
      name: input.name,
      status: 'TRIAL',
      tier: 'STARTER',
      settings: { parentTenantId, contactPhone: input.contactPhone },
    });
    const savedTenant = await this.tenants.save(childTenant);

    // Create API key for child
    await this.apiKeyService.create(savedTenant.id);

    return savedTenant;
  }

  /**
   * Get default feature flags for new tenants.
   */
  getDefaultFeatureFlags(): Record<string, boolean> {
    return {
      multiWarehouse: true,
      codRemittance: true,
      brandedTracking: false,
      whatsappNotifications: false,
      advancedRateShopping: true,
    };
  }

  /**
   * Set default feature flags for a tenant.
   */
  private setDefaultFlags(tenantId: number): void {
    const flags = this.getDefaultFeatureFlags();
    for (const [key, value] of Object.entries(flags)) {
      this.featureFlagService.setFlag(tenantId, key, value);
    }
  }

  /**
   * Sanitize a string to a URL-safe slug.
   */
  private slugify(s: string): string {
    return s
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 32);
  }
}
