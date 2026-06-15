// Public barrel for the COD lib.
// SS-042: the implementation in libs/domains/cod/src/lib now runs against
// real TypeORM repositories (OrderEntity, CodRemittanceEntity) — no more
// PrismaCompat shim. New consumers should import from
// `@swiftship/domains-cod`.

export { CodModule, CodModule as CodLibModule } from './lib/cod.module';
export { CodService, CodService as CodLibService } from './lib/cod.service';
export { CodResolver, CodResolver as CodLibResolver } from './lib/cod.resolver';
