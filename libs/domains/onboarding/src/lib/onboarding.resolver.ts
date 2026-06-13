import { Args, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { OnboardingService } from './onboarding.service';
import { OnboardingStateModel } from './onboarding.model';
import { UpdateOnboardingInput } from './dto/update-onboarding.input';

@Resolver(() => OnboardingStateModel)
export class OnboardingResolver {
  constructor(private readonly onboarding: OnboardingService) {}

  @Query(() => OnboardingStateModel)
  onboardingState(@Args('userId', { type: () => Int }) userId: number) {
    // Debug log for observability
    // eslint-disable-next-line no-console
    console.log('[OnboardingResolver] onboardingState query', { userId });
    return this.onboarding.getOrCreateForUser(userId);
  }

  @Mutation(() => OnboardingStateModel)
  updateOnboardingState(
    @Args('userId', { type: () => Int }) userId: number,
    @Args('updateOnboardingInput') update: UpdateOnboardingInput,
  ) {
    // eslint-disable-next-line no-console
    console.log('[OnboardingResolver] updateOnboardingState mutation', { userId, update });
    return this.onboarding.updateForUser(userId, update);
  }

  @ResolveField('metadata', () => String, { nullable: true })
  metadata(@Parent() state: any) {
    const value = state?.metadata;
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
}
