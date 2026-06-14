import { Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import IORedis, { type Redis } from 'ioredis';
import { REDIS_CLIENT } from './rate-cache.tokens';
import { RateCacheService } from './rate-cache.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RateShopService } from './rate-shop.service';
import { PlatformCarriersModule } from '@swiftship/platform-carriers';
import { TenantModule } from '@swiftship/domains-tenants';

/**
 * Factory for the shared ioredis client. Reads `REDIS_URL` from env
 * (defaults to `redis://localhost:6379` for dev parity with the queue
 * lib). The client is `lazyConnect: false` so misconfiguration is
 * surfaced at boot rather than on the first cache hit.
 */
const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    return new IORedis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  },
};

@Module({
  imports: [ConfigModule, PlatformCarriersModule, TenantModule],
  providers: [redisProvider, RateCacheService, CircuitBreakerService, RateShopService],
  exports: [RateCacheService, CircuitBreakerService, RateShopService],
})
export class RateCacheModule {}