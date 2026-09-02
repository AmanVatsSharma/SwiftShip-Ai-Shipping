import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PincodeZoneEntity, RateZoneMatrixEntity } from '@swiftship/platform-typeorm';

// Direct file imports (NOT the './index' barrel) so the barrel can safely
// re-export this module without a circular reference — consumers import
// `RateMathModule` from '@swiftship/platform-rate-math'.
import { WeightBreakService } from './lib/weight-break.service';
import { FuelSurchargeService } from './lib/fuel-surcharge.service';
import { FuelSurchargeScheduler } from './lib/fuel-surcharge.scheduler';
import { CodSurchargeService } from './lib/cod-surcharge.service';
import { OdaSurchargeService } from './lib/oda-surcharge.service';
import { ZoneResolverService } from './lib/zone-resolver.service';
import { RateMathService } from './lib/rate-math.service';

/**
 * RateMathModule — wire up the rate-math lib.
 *
 * Usage:
 *   apps/api/src/app.module.ts imports it once as a global provider.
 *   Feature modules can inject these services in their providers lists.
 *
 * Depends on:
 *   - TypeORM repos for pincode_zones (SS-007) and rate_zone_matrix (this bead)
 *   - ConfigModule (env vars)
 */
@Module({})
export class RateMathModule {
  static forRoot(): DynamicModule {
    return {
      module: RateMathModule,
      imports: [TypeOrmModule.forFeature([PincodeZoneEntity, RateZoneMatrixEntity])],
      providers: [
        WeightBreakService,
        FuelSurchargeService,
        FuelSurchargeScheduler,
        CodSurchargeService,
        OdaSurchargeService,
        ZoneResolverService,
        RateMathService,
      ],
      exports: [
        WeightBreakService,
        FuelSurchargeService,
        FuelSurchargeScheduler,
        CodSurchargeService,
        OdaSurchargeService,
        ZoneResolverService,
        RateMathService,
      ],
    };
  }
}
