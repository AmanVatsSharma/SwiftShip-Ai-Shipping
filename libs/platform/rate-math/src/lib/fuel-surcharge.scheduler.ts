import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FuelSurchargeService } from './fuel-surcharge.service';

/**
 * FuelSurchargeScheduler — daily 2 AM cron that refreshes the global
 * fuel surcharge percentage from the MyPetrolPrice RSS feed.
 *
 * Why 2 AM:
 *   MyPetrolPrice updates their RSS in the late evening IST. 2 AM is
 *   after the update has propagated and well before the morning rate-shop
 *   traffic spike, so the cache is warm by the time merchants open
 *   their dashboards.
 *
 * The cron runs in whatever process the host (api worker, dedicated
 * scheduler, etc.) is in. In multi-instance deployments we'll want to
 * add a leader-elect lock (e.g. Redis SETNX with TTL) so only one
 * instance refreshes per day — that's a follow-up, not in SS-011.
 */
@Injectable()
export class FuelSurchargeScheduler {
  private readonly logger = new Logger(FuelSurchargeScheduler.name);

  constructor(private readonly fuel: FuelSurchargeService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async refreshDaily(): Promise<void> {
    this.logger.log('Daily fuel surcharge refresh starting...');
    try {
      await this.fuel.refreshFromRss();
    } catch (err) {
      this.logger.error(
        'Fuel surcharge refresh failed; keeping the previous value',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
