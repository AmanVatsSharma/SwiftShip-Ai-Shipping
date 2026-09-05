export {
  OnboardingModule,
  OnboardingModule as OnboardingLibModule,
} from './lib/onboarding.module';
export {
  OnboardingService,
  OnboardingService as OnboardingLibService,
} from './lib/onboarding.service';
export {
  OnboardingResolver,
  OnboardingResolver as OnboardingLibResolver,
} from './lib/onboarding.resolver';
export {
  OnboardingGuard,
  OnboardingGuard as OnboardingLibGuard,
} from './lib/onboarding.guard';
export { OnboardingStateModel } from './lib/onboarding.model';

// SS-031: KYC (PAN + GSTIN + bank) is shipped under the onboarding
// domain. Re-export the public surface so other domain libs (e.g.
// orders) can pull `KycService` from `@swiftship/domains-onboarding`
// without a deep relative path.
// SS-043b: the legacy `src/onboarding/*` re-exports are gone —
// everything is now served from this lib.
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
