import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueuesModule } from '@swiftship/platform-queues';
import { TenantModule } from '@swiftship/domains-tenants';
import { OnboardingStateEntity } from '@swiftship/platform-typeorm';
import { OnboardingService } from './onboarding.service';
import { OnboardingResolver } from './onboarding.resolver';
import { OnboardingGuard } from './onboarding.guard';

/**
 * OnboardingModule — TypeORM-backed (SS-043b).
 *
 * Imports `TypeOrmModule.forFeature([OnboardingStateEntity])` and
 * provides the service, resolver, and guard. The PrismaModule import
 * that the legacy `src/onboarding/onboarding.module.ts` carried is
 * gone — there is no Prisma dependency left in this tree.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OnboardingStateEntity])],
  providers: [OnboardingService, OnboardingResolver, OnboardingGuard],
  exports: [OnboardingService, OnboardingGuard],
})
export class OnboardingModule {}
