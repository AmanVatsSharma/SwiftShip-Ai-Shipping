import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RtoDisputeEntity } from '@swiftship/platform-typeorm';
import { RtoDispute, RtoDisputeStatus } from './rto-dispute.model';

/**
 * SS-019 — RtoDisputeResolver
 *
 * GraphQL surface for the admin-portal dispute queue. Two query shapes
 * ("open disputes for tenant" / "single dispute by id") and one mutation
 * ("resolve dispute"). Resolution is the only write path — opening a
 * dispute is owned by RtoSettlementService and is not user-initiated.
 *
 * Tenant isolation: the open-disputes query takes an explicit `tenantId`
 * (the admin UI knows which tenant it's operating on). The single-dispute
 * lookup and the resolve mutation are scoped by `id` alone; admin tools
 * that hit them need to gate by tenant at the GraphQL layer (the admin
 * portal does this via the auth guard).
 */
@Resolver(() => RtoDispute)
export class RtoDisputeResolver {
  constructor(
    @InjectRepository(RtoDisputeEntity)
    private readonly disputes: Repository<RtoDisputeEntity>,
  ) {}

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------

  @Query(() => [RtoDispute], {
    description: 'All OPEN RTO disputes for a tenant, newest first.',
  })
  openRtoDisputes(
    @Args('tenantId', { type: () => Int }) tenantId: number,
  ): Promise<RtoDisputeEntity[]> {
    return this.disputes.find({
      where: { tenantId, status: RtoDisputeStatus.OPEN },
      order: { openedAt: 'DESC' },
    });
  }

  @Query(() => [RtoDispute], {
    description: 'All RTO disputes for a tenant (any status), newest first.',
  })
  rtoDisputesByTenant(
    @Args('tenantId', { type: () => Int }) tenantId: number,
  ): Promise<RtoDisputeEntity[]> {
    return this.disputes.find({
      where: { tenantId },
      order: { openedAt: 'DESC' },
    });
  }

  @Query(() => RtoDispute, {
    nullable: true,
    description: 'Look up a single RTO dispute by id.',
  })
  rtoDispute(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<RtoDisputeEntity | null> {
    return this.disputes.findOne({ where: { id } });
  }

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------

  @Mutation(() => RtoDispute, {
    description:
      'Resolve an RTO dispute. The carrier-fault path optionally ' +
      'records a merchant compensation amount (paise).',
  })
  async resolveRtoDispute(
    @Args('id', { type: () => Int }) id: number,
    @Args('status', { type: () => String })
    status:
      | 'RESOLVED_CARRIER_FAULT'
      | 'RESOLVED_MERCHANT_FAULT'
      | 'REJECTED',
    @Args('resolution') resolution: string,
    @Args('refundedPaise', { type: () => Int, nullable: true })
    refundedPaise?: number,
  ): Promise<RtoDisputeEntity | null> {
    if (!resolution || resolution.trim().length === 0) {
      throw new BadRequestException('resolution is required');
    }
    const validStatuses = [
      'RESOLVED_CARRIER_FAULT',
      'RESOLVED_MERCHANT_FAULT',
      'REJECTED',
    ] as const;
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `resolveRtoDispute only accepts ${validStatuses.join(', ')}`,
      );
    }
    const update: Partial<RtoDisputeEntity> = {
      status,
      resolution,
      refundedPaise: refundedPaise ?? null,
      resolvedAt: new Date(),
    };
    await this.disputes.update({ id }, update);
    return this.disputes.findOne({ where: { id } });
  }
}
