// Re-export barrel for the COD lib.
// Until Plan 3 ships a full TypeORM implementation, the src/ implementation
// runs against PrismaCompat (TypeORM-backed). New consumers should import
// from `@swiftship/domains-cod` rather than the relative `../cod` paths.

export { CodModule, CodModule as CodLibModule } from '../../../../src/cod/cod.module';
export { CodService, CodService as CodLibService } from '../../../../src/cod/cod.service';
export { CodResolver, CodResolver as CodLibResolver } from '../../../../src/cod/cod.resolver';
