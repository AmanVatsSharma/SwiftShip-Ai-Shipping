export { OnboardingModule, OnboardingModule as OnboardingLibModule } from '../../../../src/onboarding/onboarding.module';
export { OnboardingService, OnboardingService as OnboardingLibService } from '../../../../src/onboarding/onboarding.service';
export { OnboardingResolver, OnboardingResolver as OnboardingLibResolver } from '../../../../src/onboarding/onboarding.resolver';
export { OnboardingGuard, OnboardingGuard as OnboardingLibGuard } from '../../../../src/onboarding/onboarding.guard';
export { OnboardingStateModel } from '../../../../src/onboarding/onboarding.model';

// SS-031: KYC (PAN + GSTIN + bank) is shipped under the onboarding
// domain. Re-export the public surface so other domain libs (e.g.
// orders) can pull `KycService` from `@swiftship/domains-onboarding`
// without a deep relative path.
export {
  KycModule,
  KycService,
  PanValidatorService,
  GstinValidatorService,
  BankVerifierService,
  SetuSandboxBankVerifier,
  KYC_QUEUE_NAME,
  KYC_VERIFY_JOB,
  KYC_VERIFY_MAX_ATTEMPTS,
  PAN_REGEX,
  GSTIN_REGEX,
  KycRecordEntity,
  KycDocumentEntity,
  KycStatus,
  KycDocumentType,
} from './lib/kyc';
