import { Args, Float, Int, Mutation, Resolver } from '@nestjs/graphql';
import { CodService } from './cod.service';

@Resolver()
export class CodResolver {
  constructor(private readonly cod: CodService) {}

  @Mutation(() => String, { description: 'Create a COD remittance record' })
  async remitCod(
    @Args('orderId', { type: () => Int }) orderId: number,
    @Args('amount', { type: () => Float }) amount: number,
    @Args('referenceId', { nullable: true }) referenceId?: string,
  ) {
    const r = await this.cod.remit(orderId, amount, referenceId);
    return JSON.stringify(r);
  }
}
