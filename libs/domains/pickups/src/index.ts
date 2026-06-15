// Re-export barrel for the Pickups lib.
// Migrated to TypeORM (SS-043f) — `PickupsService` now uses
// `@InjectRepository(PickupEntity)` / `@InjectRepository(ShipmentEntity)`
// from `@swiftship/platform-typeorm` directly. New consumers should
// import from `@swiftship/domains-pickups` rather than the relative
// `../../../../src/pickups/...` paths.

export { PickupsModule, PickupsModule as PickupsLibModule } from './lib/pickups.module';
export { PickupsService, PickupsService as PickupsLibService } from './lib/pickups.service';
export { PickupsResolver, PickupsResolver as PickupsLibResolver } from './lib/pickups.resolver';
export { SchedulePickupInput } from './lib/schedule-pickup.input';
