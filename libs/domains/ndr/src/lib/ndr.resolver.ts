import { Args, Int, Mutation, Resolver } from '@nestjs/graphql';
import { NdrService } from './ndr.service';
import { Query } from '@nestjs/graphql';

@Resolver()
export class NdrResolver {
  constructor(private readonly ndr: NdrService) {}

  @Mutation(() => String)
  async openNdrCase(@Args('shipmentId', { type: () => Int }) shipmentId: number, @Args('reason') reason: string) {
    const c = await this.ndr.openCase(shipmentId, reason);
    return JSON.stringify(c);
  }

  @Mutation(() => String)
  async closeNdrCase(@Args('shipmentId', { type: () => Int }) shipmentId: number, @Args('actionNotes', { nullable: true }) actionNotes?: string) {
    const c = await this.ndr.closeCase(shipmentId, actionNotes);
    return JSON.stringify(c);
  }

  @Query(() => String, { description: 'NDR analytics summary as JSON' })
  async ndrAnalytics() {
    const a = await this.ndr.analytics();
    return JSON.stringify(a);
  }
}
