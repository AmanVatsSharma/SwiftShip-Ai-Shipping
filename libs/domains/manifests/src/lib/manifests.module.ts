import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingModule } from '@swiftship/domains-onboarding';
import {
  ManifestEntity,
  ManifestItemEntity,
} from '@swiftship/platform-typeorm';
import { TenantModule } from '@swiftship/domains-tenants';
import { ManifestsService } from './manifests.service';
import { ManifestsResolver } from './manifests.resolver';

/**
 * ManifestsModule — TypeORM-backed (SS-043b).
 *
 * Imports TypeOrmModule.forFeature for the two entities this lib
 * owns. TenantModule provides TenantContext so ManifestsService can
 * stamp tenantId on new manifests.
 */
@Module({
  imports: [
    OnboardingModule,
    TypeOrmModule.forFeature([ManifestEntity, ManifestItemEntity]),
    TenantModule,
  ],
  providers: [ManifestsService, ManifestsResolver],
  exports: [ManifestsService],
})
export class ManifestsModule {}
