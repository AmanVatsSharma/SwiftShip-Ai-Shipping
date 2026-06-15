import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ManifestEntity } from '@swiftship/platform-typeorm';
import { OnboardingGuard } from '@swiftship/domains-onboarding';
import { ManifestsService } from './manifests.service';
import { GenerateManifestInput } from './generate-manifest.input';

/**
 * GraphQL surface for the Manifests domain.
 *
 * The guard is the same OnboardingGuard that legacy manifests used —
 * it refuses calls from users whose onboarding state is BLOCKED.
 * New code should keep using this guard so a manifest can't be
 * generated from a tenant that hasn't completed KYC.
 */
@Resolver(() => ManifestEntity)
export class ManifestsResolver {
  constructor(private readonly manifestsService: ManifestsService) {}

  @Query(() => [ManifestEntity], { description: 'All manifests for the current tenant, newest first.' })
  manifests(): Promise<ManifestEntity[]> {
    return this.manifestsService.listManifests();
  }

  @Query(() => ManifestEntity, {
    nullable: true,
    description: 'Look up a single manifest by id.',
  })
  manifest(@Args('id', { type: () => Int }) id: number) {
    return this.manifestsService.getManifest(id);
  }

  @UseGuards(OnboardingGuard)
  @Mutation(() => ManifestEntity, { description: 'Generate manifest for shipments' })
  async generateManifest(@Args('generateManifestInput') input: GenerateManifestInput) {
    return this.manifestsService.generateManifest(input.shipmentIds);
  }
}
