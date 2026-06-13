import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ManifestsService } from './manifests.service';
import { GenerateManifestInput } from './generate-manifest.input';
import { UseGuards } from '@nestjs/common';
import { OnboardingGuard } from '../onboarding/onboarding.guard';

@Resolver()
export class ManifestsResolver {
  constructor(private readonly manifests: ManifestsService) {}

  @UseGuards(OnboardingGuard)
  @Mutation(() => String, { description: 'Generate manifest for shipments' })
  async generateManifest(@Args('generateManifestInput') input: GenerateManifestInput) {
    const m = await this.manifests.generateManifest(input.shipmentIds);
    return JSON.stringify(m);
  }
}
