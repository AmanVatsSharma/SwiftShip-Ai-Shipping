import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { TenantGuard } from '@swiftship/domains-tenants';
import { KycService } from './kyc.service';
import { SubmitKycInput } from './kyc.input';
import { KycRecordModel } from './kyc.model';

/**
 * SS-031 — GraphQL surface for KYC submissions.
 *
 * Both endpoints are guarded by TenantGuard (SS-001) — a tenant id must
 * be present on the request (from the API key or the JWT). Unverified
 * tenants can still call `submitKyc` (otherwise we'd never let them
 * complete onboarding); only `kycStatus` requires a verified tenant.
 */
@Resolver(() => KycRecordModel)
export class KycResolver {
  constructor(private readonly kyc: KycService) {}

  @Mutation(() => KycRecordModel, {
    description: 'Submit a KYC payload (PAN, GSTIN, bank). Triggers async verify.',
  })
  @UseGuards(TenantGuard)
  async submitKyc(
    @Args('input') input: SubmitKycInput,
  ): Promise<KycRecordModel> {
    const record = await this.kyc.submitKyc(input);
    return record as any;
  }

  @Query(() => KycRecordModel, {
    nullable: true,
    description: 'Latest KYC record for the current tenant.',
  })
  @UseGuards(TenantGuard)
  async kycStatus(): Promise<KycRecordModel | null> {
    const record = await this.kyc.kycStatus();
    return record as any;
  }
}
