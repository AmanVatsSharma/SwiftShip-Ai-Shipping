/**
 * Barrel for the rate-math lib.
 *
 * Exports all the services and types. The `RateMathModule` is in
 * `libs/platform/rate-math/src/rate-math.module.ts` — apps import
 * it from there directly to avoid a barrel self-import.
 */
export { WeightBreakService } from './lib/weight-break.service';
export { FuelSurchargeService } from './lib/fuel-surcharge.service';
export { FuelSurchargeScheduler } from './lib/fuel-surcharge.scheduler';
export { CodSurchargeService } from './lib/cod-surcharge.service';
export { OdaSurchargeService } from './lib/oda-surcharge.service';
export { ZoneResolverService } from './lib/zone-resolver.service';
export { RateMathService } from './lib/rate-math.service';
export type { ZoneLetter } from './lib/zone-resolver.service';
