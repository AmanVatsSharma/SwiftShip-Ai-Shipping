import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingModule } from '@swiftship/domains-onboarding';
import { PickupEntity, ShipmentEntity } from '@swiftship/platform-typeorm';
import { OnboardingLibModule } from '@swiftship/domains-onboarding';
import { PickupsService } from './pickups.service';
import { PickupsResolver } from './pickups.resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([PickupEntity, ShipmentEntity]),
    OnboardingLibModule,
  ],
  providers: [PickupsService, PickupsResolver],
  exports: [PickupsService],
})
export class PickupsModule {}
