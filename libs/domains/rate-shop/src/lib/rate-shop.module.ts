import { Module } from '@nestjs/common';
import { RateShopService } from './rate-shop.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceabilityService } from './serviceability.service';
import { RateShopResolver } from './rate-shop.resolver';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  providers: [PrismaService, RateShopService, ServiceabilityService, RateShopResolver],
  exports: [RateShopService, ServiceabilityService],
})
export class RateShopModule {}
