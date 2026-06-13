import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { PickupsService } from './pickups.service';
import { SchedulePickupInput } from './schedule-pickup.input';
import { OnboardingGuard } from '../onboarding/onboarding.guard';
import { UseGuards } from '@nestjs/common';

@Resolver()
export class PickupsResolver {
  constructor(private readonly pickups: PickupsService) {}

  @UseGuards(OnboardingGuard)
  @Mutation(() => String, { description: 'Schedule a pickup for a shipment' })
  async schedulePickup(@Args('schedulePickupInput') input: SchedulePickupInput) {
    const pickup = await this.pickups.schedulePickup(input.shipmentId, new Date(input.scheduledAt));
    return JSON.stringify(pickup);
  }
}
