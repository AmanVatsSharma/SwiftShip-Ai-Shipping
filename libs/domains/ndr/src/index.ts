// Re-export barrel for the NDR (Non-Delivery Report) lib.
// Until Plan 3 ships a full TypeORM implementation, the src/ implementation
// runs against PrismaCompat (TypeORM-backed). New consumers should import
// from `@swiftship/domains-ndr` rather than the relative `../ndr` paths.

export { NdrModule, NdrModule as NdrLibModule } from '../../../../src/ndr/ndr.module';
export { NdrService, NdrService as NdrLibService } from '../../../../src/ndr/ndr.service';
export { NdrResolver, NdrResolver as NdrLibResolver } from '../../../../src/ndr/ndr.resolver';
