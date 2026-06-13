import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  TenantApiKeyEntity,
  TenantEntity,
  TenantFeatureFlagEntity,
  TenantMemberEntity,
  TenantRoleEntity,
} from './entities';
import { TenantFeatureFlagService } from './tenant-feature-flag.service';
import { TenantGuard } from './tenant.guard';
import { TenantMiddleware } from './tenant.middleware';
import { TenantResolver } from './tenant.resolver';
import { TenantService } from './tenant.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantEntity,
      TenantMemberEntity,
      TenantRoleEntity,
      TenantFeatureFlagEntity,
      TenantApiKeyEntity,
    ]),
  ],
  providers: [
    TenantService,
    TenantFeatureFlagService,
    TenantGuard,
    TenantResolver,
  ],
  exports: [TenantService, TenantFeatureFlagService, TenantGuard],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
