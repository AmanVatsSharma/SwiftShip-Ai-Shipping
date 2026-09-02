/**
 * Barrel for the rate-math lib.
 *
 * Exports the services, types, and the module. (2026-08: the module now
 * imports its services via direct file paths, so exporting it here no
 * longer creates a barrel self-import cycle.)
 */
export { WeightBreakService } from './lib/weight-break.service';
export { FuelSurchargeService } from './lib/fuel-surcharge.service';
export { FuelSurchargeScheduler } from './lib/fuel-surcharge.scheduler';
export { CodSurchargeService } from './lib/cod-surcharge.service';
export { OdaSurchargeService } from './lib/oda-surcharge.service';
export { ZoneResolverService } from './lib/zone-resolver.service';
export { RateMathService } from './lib/rate-math.service';
export type { ZoneLetter } from './lib/zone-resolver.service';
export { RateMathModule } from './rate-math.module';
