import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { OnboardingService } from './onboarding.service';

@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(private readonly onboarding: OnboardingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const req = ctx.getContext().req;
    const user = req?.user as { id?: number } | undefined;

    // Allow if no user context (public queries)
    if (!user?.id) return true;

    const state = await this.onboarding.getOrCreateForUser(user.id);
    if (state.status === 'BLOCKED') {
      throw new ForbiddenException(state.blockedReason || 'Onboarding blocked');
    }

    return true;
  }
}
