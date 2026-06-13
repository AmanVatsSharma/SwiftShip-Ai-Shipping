import { Global, Module } from '@nestjs/common';
import { StructuredLogger } from './logger.service';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  providers: [StructuredLogger],
  controllers: [MetricsController],
  exports: [StructuredLogger],
})
export class ObservabilityModule {}
