import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * FuelSurchargeService — computes the fuel surcharge on a base rate.
 *
 * How it works in production:
 *   The current surcharge percentage is updated daily by a cron job
 *   (`FuelSurchargeScheduler`) which fetches the MyPetrolPrice RSS feed,
 *   parses the latest diesel price, and computes the pct delta vs. a
 *   baseline diesel price. The baseline + delta math is left as a TODO
 *   in `refreshFromRss()` — for now the value is pinned to 18% (a
 *   representative mid-2024 figure for Indian diesel).
 *
 * Carrier-specific overrides:
 *   Some carriers (e.g. BlueDart) publish their own fuel surcharge that
 *   is independent of the central rate. Pass `carrierCode` to pick up
 *   a `FUEL_SURCHARGE_<CODE>` env var override; otherwise the global
 *   rate is used.
 *
 * Currency:
 *   All inputs/outputs are paise. We `Math.round` to the nearest paise
 *   so downstream BIGINT columns don't reject the value.
 */
@Injectable()
export class FuelSurchargeService {
  private readonly logger = new Logger(FuelSurchargeService.name);

  /**
   * Current fuel surcharge percentage (0.18 = 18%). Refreshed by the
   * scheduler in `fuel-surcharge.scheduler.ts`. Marked `private` so
   * the scheduler can mutate it via `setCurrentFuelSurchargePct`.
   */
  private currentFuelSurchargePct = 0.18;

  constructor(private readonly config: ConfigService) {}

  /**
   * Compute the fuel surcharge (paise) for a given base rate.
   *
   * @param baseRate     The base rate in paise (typically pre-weight-break)
   * @param carrierCode  The carrier code, e.g. `DELHIVERY` (case-insensitive
   *                     lookup against the `FUEL_SURCHARGE_<CODE>` env var)
   * @returns            The fuel surcharge in paise (rounded)
   */
  compute(baseRate: number, carrierCode: string): number {
    const carrierSpecific = this.config.get<number>(
      `FUEL_SURCHARGE_${carrierCode.toUpperCase()}`,
    );
    const pct = carrierSpecific ?? this.currentFuelSurchargePct;
    return Math.round(baseRate * pct);
  }

  /**
   * Returns the current global fuel surcharge percentage. Used by
   * the scheduler and by tests; carrier adapters should call
   * `compute()` directly, not this.
   */
  getCurrentFuelSurchargePct(): number {
    return this.currentFuelSurchargePct;
  }

  /**
   * Set the global fuel surcharge percentage. Called by the cron
   * after a successful RSS parse.
   */
  setCurrentFuelSurchargePct(pct: number): void {
    this.currentFuelSurchargePct = pct;
  }

  /**
   * Refresh the fuel surcharge from the MyPetrolPrice RSS feed.
   *
   * TODO: fetch https://www.mypetrolprice.com/petrol-price-india.aspx,
   * parse the latest diesel price, compute the pct delta vs. baseline,
   * and call `setCurrentFuelSurchargePct(...)`. For SS-011 we leave a
   * stub that resets the rate to 18% (the same default the constructor
   * uses) so the system has a sane value out of the box.
   */
  async refreshFromRss(): Promise<void> {
    // Stub. Real impl would do something like:
    //   const rss = await this.http.get(MY_PETROL_PRICE_RSS_URL);
    //   const dieselPrice = parseLatestDieselPrice(rss.data);
    //   const pct = computeFuelSurchargePct(dieselPrice, BASELINE_DIESEL_PRICE);
    //   this.setCurrentFuelSurchargePct(pct);
    this.logger.log('Fuel surcharge refreshed (stub).');
    this.setCurrentFuelSurchargePct(0.18);
  }
}
