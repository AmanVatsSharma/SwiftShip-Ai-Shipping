import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import { RateSurchargeEntity } from '@swiftship/platform-typeorm';
import { SurchargesResolver } from './surcharges.resolver';

@Module({
  imports: [AuthLibModule, TypeOrmModule.forFeature([RateSurchargeEntity])],
  providers: [SurchargesResolver],
})
export class SurchargesModule {}
