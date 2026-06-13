// Re-export barrel for the Pickups lib.
// Until Plan 3 ships a full TypeORM implementation, the src/ implementation
// runs against PrismaCompat (TypeORM-backed). New consumers should import
// from `@swiftship/domains-pickups` rather than the relative `../pickups` paths.

export { PickupsModule, PickupsModule as PickupsLibModule } from '../../../../src/pickups/pickups.module';
export { PickupsService, PickupsService as PickupsLibService } from '../../../../src/pickups/pickups.service';
export { PickupsResolver, PickupsResolver as PickupsLibResolver } from '../../../../src/pickups/pickups.resolver';
export { SchedulePickupInput } from '../../../../src/pickups/schedule-pickup.input';
