import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@swiftship/platform-typeorm';
import {
  TenantApiKeyEntity,
  TenantEntity,
  TenantFeatureFlagEntity,
  TenantMemberEntity,
  TenantRoleEntity,
} from './entities';
import { InviteEntity } from './invite.entity';
import { TenantContext } from './tenant.context';
import { TenantFeatureFlagService } from './tenant-feature-flag.service';
import { TenantGuard } from './tenant.guard';
import { TenantMiddleware } from './tenant.middleware';
import { TenantResolver } from './tenant.resolver';
import { TenantService } from './tenant.service';
import { OnboardingService } from './onboarding.service';
import { ApiKeyService } from './api-key.service';
import { WalletEntity } from './wallet.entity';
import { WalletInvoiceService } from './wallet-invoice.service';
import { WalletLedgerEntity } from './wallet-ledger.entity';
import { WalletResolver } from './wallet.resolver';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantEntity,
      TenantMemberEntity,
      TenantRoleEntity,
      TenantFeatureFlagEntity,
      TenantApiKeyEntity,
      InviteEntity,
      UserEntity,
      WalletEntity,
      WalletLedgerEntity,
    ]),
  ],
  providers: [
    TenantContext,
    TenantService,
    TenantFeatureFlagService,
    TenantGuard,
    TenantResolver,
    OnboardingService,
    ApiKeyService,
    WalletService,
    WalletResolver,
    WalletInvoiceService,
  ],
  exports: [
    TenantContext,
    TenantService,
    TenantFeatureFlagService,
    TenantGuard,
    OnboardingService,
    ApiKeyService,
    WalletService,
    WalletInvoiceService,
  ],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
