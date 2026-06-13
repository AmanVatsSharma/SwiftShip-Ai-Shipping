import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CarrierAdapterService } from './carrier-adapter.service';

@Module({
  imports: [ConfigModule],
  providers: [CarrierAdapterService],
  exports: [CarrierAdapterService],
})
export class PlatformCarriersModule {}
