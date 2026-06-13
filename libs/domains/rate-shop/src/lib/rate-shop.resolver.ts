import { Args, Float, Int, Query, Resolver } from '@nestjs/graphql';
import { RateShopService } from './rate-shop.service';

@Resolver()
export class RateShopResolver {
  constructor(private readonly rateShop: RateShopService) {}

  @Query(() => String, { description: 'Get best carrier decision for shipment parameters' })
  async rateShopDecision(
    @Args('originPincode') originPincode: string,
    @Args('destinationPincode') destinationPincode: string,
    @Args('weightGrams', { type: () => Int }) weightGrams: number,
    @Args('lengthCm', { type: () => Float, nullable: true }) lengthCm?: number,
    @Args('widthCm', { type: () => Float, nullable: true }) widthCm?: number,
    @Args('heightCm', { type: () => Float, nullable: true }) heightCm?: number,
  ) {
    const decision = await this.rateShop.shop({ originPincode, destinationPincode, weightGrams, lengthCm, widthCm, heightCm });
    return JSON.stringify(decision);
  }
}
