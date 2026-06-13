import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Tenant } from './tenant.model';
import type {
  AssignRoleInput,
  CreateTenantInput,
  UpdateTenantInput,
} from './tenant.input';
import { TenantService } from './tenant.service';

@Resolver(() => Tenant)
export class TenantResolver {
  constructor(private readonly tenants: TenantService) {}

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
}
