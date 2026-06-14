import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CourierScoreService } from './courier-score.service';

/**
 * CourierScoreScheduler
 *
 * Daily cron that refreshes the per-carrier courier scorecard so the
 * `RateRankingService` (SS-010) is no longer reading stale scores that
 * were computed once at SS-016 build time.
 *
 * Schedule: `0 20 * * *` — 20:00 UTC, which is 02:30 IST (UTC+05:30
 * / +06:30 with DST). This deliberately lands in the same quiet window
 * the existing `CourierScoreWorker` (BullMQ) targets: late night in
 * India, well before the morning rate-shop traffic spike. Using a
 * separate `@Cron` here keeps the two jobs independent — the BullMQ
 * worker still owns the per-(carrier, zone, day) row population
 * (last 7 days, sliding), and this scheduler owns the roll-up that
 * `RateRankingService` actually reads.
 *
 * Why a `@Cron` and not just a BullMQ repeat:
 *  - The dashboard lib already depends on `@nestjs/schedule` for the
 *    adjacent `CourierScoreWorker`'s repeat. Reusing it keeps the
 *    deployment surface small — no new queue, no new worker, no new
 *    Redis connection.
 *  - In multi-instance deployments, add a leader-elect lock (Redis
 *    SETNX with TTL) so only one pod refreshes per day. That is a
 *    follow-up; the same caveat already applies to the worker.
 *
 * Resilience: if `recomputeAll` throws, we catch and log — the cron
 * will not kill the host. Per-carrier failures inside `recomputeAll`
 * are also caught there, so the worst case here is "the whole sweep
 * failed; tomorrow's run will try again".
 */
@Injectable()
export class CourierScoreScheduler {
  private readonly logger = new Logger(CourierScoreScheduler.name);

  /** Public so tests can assert on the cron expression. */
  static readonly CRON_EXPR = '0 20 * * *';
  static readonly CRON_NAME = 'refresh-courier-scores';
  static readonly DEFAULT_WINDOW = 30 as const;

  constructor(private readonly courierScore: CourierScoreService) {}

  /**
   * Daily 20:00 UTC refresh. Window defaults to 30 days per the SS-012
   * spec; the `recomputeAll` signature also accepts 60d / 90d for
   * ad-hoc invocations from a future admin "refresh now" mutation.
   */
  @Cron(CourierScoreScheduler.CRON_EXPR, {
    name: CourierScoreScheduler.CRON_NAME,
  })
  async refreshDaily(): Promise<void> {
    this.logger.log(
      `Starting daily courier score refresh (${CourierScoreScheduler.DEFAULT_WINDOW}d window)...`,
    );
    try {
      const result = await this.courierScore.recomputeAll(
        CourierScoreScheduler.DEFAULT_WINDOW,
      );
      this.logger.log(
        `Courier score refresh complete (${result.windowDays}d window, processed=${result.carriersProcessed}, failed=${result.carriersFailed}).`,
      );
    } catch (err) {
      this.logger.error(
        `Courier score refresh failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
