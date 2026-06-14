export { TenantModule } from './lib/tenant.module';
export { TenantGuard } from './lib/tenant.guard';
export { TenantMiddleware } from './lib/tenant.middleware';
export { TenantService } from './lib/tenant.service';
export { TenantFeatureFlagService } from './lib/tenant-feature-flag.service';
export { TenantResolver } from './lib/tenant.resolver';
export { OnboardingService } from './lib/onboarding.service';
export { ApiKeyService } from './lib/api-key.service';
export { Tenant, TenantMember } from './lib/tenant.model';
export {
  ApiKey,
  Invite,
  OnboardingApiKey,
  OnboardingResult,
  OnboardingUser,
} from './lib/invite.model';
export {
  AssignRoleInput,
  CreateTenantInput,
  UpdateTenantInput,
} from './lib/tenant.input';
export {
  InviteTeamMemberInput,
  OnboardTenantInput,
  SubAccountInput,
} from './lib/invite.input';
export {
  TenantApiKeyEntity,
  TenantEntity,
  TenantFeatureFlagEntity,
  TenantMemberEntity,
  TenantRoleEntity,
} from './lib/entities';
export { InviteEntity } from './lib/invite.entity';
export type {
  TenantMemberRole,
  TenantStatus,
  TenantTier,
} from './lib/enums';

// Wallet domain exports
export { WalletEntity } from './lib/wallet.entity';
export {
  WalletLedgerEntity,
  type WalletLedgerEntryType,
} from './lib/wallet-ledger.entity';
export { Wallet, WalletLedgerEntry } from './lib/wallet.model';
export {
  LockFundsInput,
  ReleaseFundsInput,
  TopUpWalletInput,
  TransferWalletsInput,
  WalletStatementFilterInput,
} from './lib/wallet.input';
export { WalletService } from './lib/wallet.service';
export { WalletResolver } from './lib/wallet.resolver';
export {
  WalletInvoiceService,
  type WalletTopupInvoice,
  type WalletTopupEvent,
} from './lib/wallet-invoice.service';
