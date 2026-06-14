import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { NdrCaseStatus } from '@swiftship/platform-typeorm';
import { NdrService } from './ndr.service';
import { NdrCase } from './ndr.model';

/**
 * GraphQL surface for the NDR domain.
 *
 * Mutations are intentionally low-level (transitionNdr / markDelivered /
 * initiateRto) — the higher-level flows (call attempt → WhatsApp → RTO)
 * are orchestrated by the SS-018 / SS-019 services which call into
 * NdrService directly.
 */
@Resolver(() => NdrCase)
export class NdrResolver {
  constructor(private readonly ndrService: NdrService) {}

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------

  @Query(() => [NdrCase], { description: 'All NDR cases for the current tenant.' })
  ndrCases(): Promise<NdrCase[]> {
    return this.ndrService.getNdrs();
  }

  @Query(() => NdrCase, {
    nullable: true,
    description: 'Look up a single NDR case by id.',
  })
  ndrCase(@Args('id', { type: () => Int }) id: number) {
    return this.ndrService.getNdr(id);
  }

  @Query(() => [NdrCase], {
    description: 'NDR cases for a single shipment, newest first.',
  })
  ndrCasesByShipment(
    @Args('shipmentId', { type: () => Int }) shipmentId: number,
  ) {
    return this.ndrService.getNdrsByShipment(shipmentId);
  }

  @Query(() => [NdrCase], {
    description: 'NDR cases filtered by status (e.g. PENDING, RTO_INITIATED).',
  })
  ndrCasesByStatus(@Args('status', { type: () => NdrCaseStatus }) status: NdrCaseStatus) {
    return this.ndrService.getNdrsByStatus(status);
  }

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------

  @Mutation(() => NdrCase, {
    description: 'Transition an NDR case to a new state. Throws if illegal.',
  })
  async transitionNdr(
    @Args('id', { type: () => Int }) id: number,
    @Args('to', { type: () => NdrCaseStatus }) to: NdrCaseStatus,
    @Args('reason', { nullable: true }) reason?: string,
  ) {
    try {
      return await this.ndrService.transitionNdr(id, to, reason);
    } catch (e) {
      if (e instanceof Error) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  @Mutation(() => NdrCase, {
    description: 'Mark an NDR case as DELIVERED (customer successfully re-attempted).',
  })
  markDelivered(@Args('id', { type: () => Int }) id: number) {
    return this.ndrService.resolveDelivered(id);
  }

  @Mutation(() => NdrCase, {
    description: 'Escalate an NDR case to RTO_INITIATED (max attempts exhausted).',
  })
  initiateRto(@Args('id', { type: () => Int }) id: number) {
    return this.ndrService.initiateRto(id);
  }
}
