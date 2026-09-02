// Re-export barrel for the Surcharges lib.
// SS-101: points at the local TypeORM-backed implementation only — the legacy
// root `src/surcharges` re-exports are gone (see STATUS.md §3).

export {
  SurchargesModule,
  SurchargesModule as SurchargesLibModule,
} from './lib/surcharges.module';
export {
  SurchargesResolver,
  SurchargesResolver as SurchargesLibResolver,
} from './lib/surcharges.resolver';
export { RateSurchargeModel } from './lib/rate-surcharge.model';
export { CreateRateSurchargeInput } from './lib/create-rate-surcharge.input';
export { UpdateRateSurchargeInput } from './lib/update-rate-surcharge.input';
