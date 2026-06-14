import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Tenant, TenantMember } from './tenant.model';
import {
  ApiKey,
  Invite,
  OnboardingApiKey,
  OnboardingResult,
  OnboardingUser,
} from './invite.model';
import type {
  AssignRoleInput,
  CreateTenantInput,
  UpdateTenantInput,
} from './tenant.input';
import type {
  InviteTeamMemberInput,
  OnboardTenantInput,
  SubAccountInput,
} from './invite.input';
import { TenantService } from './tenant.service';
import { OnboardingService } from './onboarding.service';
import { ApiKeyService } from './api-key.service';

@Resolver(() => Tenant)
export class TenantResolver {
  constructor(
    private readonly tenants: TenantService,
    private readonly onboarding: OnboardingService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  @Query(() => Tenant, { nullable: true, name: 'tenant' })
  async getTenant(
    @Args('id', { type: () => ID }) id: number,
  ): Promise<Tenant | null> {
    return this.tenants.findById(id);
  }

  @Query(() => [Tenant], { name: 'tenants' })
  async listTenants(
    @Args('status', { nullable: true }) status?: string,
    @Args('tier', { nullable: true }) tier?: string,
    @Args('search', { nullable: true }) search?: string,
    @Args('limit', { type: () => Number, nullable: true, defaultValue: 50 })
    limit?: number,
    @Args('offset', { type: () => Number, nullable: true, defaultValue: 0 })
    offset?: number,
  ): Promise<Tenant[]> {
    return this.tenants.list({ status, tier, search, limit, offset });
  }

  @Mutation(() => Tenant, { name: 'createTenant' })
  async createTenant(
    @Args('input') input: CreateTenantInput,
  ): Promise<Tenant> {
    return this.tenants.create(input);
  }

  @Mutation(() => Tenant, { name: 'updateTenant' })
  async updateTenant(
    @Args('input') input: UpdateTenantInput,
  ): Promise<Tenant> {
    return this.tenants.update(input.id, input);
  }

  @Mutation(() => Tenant, { name: 'suspendTenant' })
  async suspendTenant(
    @Args('id', { type: () => ID }) id: number,
  ): Promise<Tenant> {
    return this.tenants.suspend(id);
  }

  @Mutation(() => Boolean, { name: 'assignRole' })
  async assignRole(
    @Args('input') _input: AssignRoleInput,
  ): Promise<boolean> {
    // Role assignment persistence is wired by SS-005. Stub for W1.
    return true;
  }

  // ---- Onboarding (SS-005) ----

  @Mutation(() => OnboardingResult, { name: 'onboardTenant' })
  async onboardTenant(
    @Args('input') input: OnboardTenantInput,
  ): Promise<OnboardingResult> {
    return this.onboarding.onboardTenant(input);
  }

  @Mutation(() => Invite, { name: 'inviteTeamMember' })
  async inviteTeamMember(
    @Args('input') input: InviteTeamMemberInput,
  ): Promise<Invite> {
    const invite = await this.onboarding.inviteTeamMember(input);
    return {
      id: invite.id,
      tenantId: invite.tenantId,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      createdAt: invite.createdAt,
    };
  }

  @Mutation(() => TenantMember, { name: 'acceptInvite' })
  async acceptInvite(
    @Args('token') token: string,
    @Args('userId', { type: () => ID }) userId: number,
  ): Promise<TenantMember> {
    const member = await this.onboarding.acceptInvite(token, userId);
    return {
      id: member.id,
      tenantId: member.tenantId,
      userId: member.userId,
      role: member.role,
      isPrimary: member.isPrimary,
      createdAt: member.createdAt,
    };
  }

  @Mutation(() => OnboardingApiKey, { name: 'rotateApiKey' })
  async rotateApiKey(
    @Args('oldKeyId', { type: () => ID }) oldKeyId: number,
  ): Promise<OnboardingApiKey> {
    return this.onboarding.rotateApiKey(oldKeyId);
  }

  @Mutation(() => Tenant, { name: 'createSubAccount' })
  async createSubAccount(
    @Args('parentTenantId', { type: () => ID }) parentTenantId: number,
    @Args('input') input: SubAccountInput,
  ): Promise<Tenant> {
    return this.onboarding.createSubAccount(parentTenantId, input);
  }
}
