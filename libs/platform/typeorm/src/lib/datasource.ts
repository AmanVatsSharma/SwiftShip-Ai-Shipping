import { DataSource, DataSourceOptions } from 'typeorm';
import * as entities from './entities';
import * as enums from './enums';
import { AddTenantId1718160000000 } from './migrations/1718160000000-AddTenantId';
import { AddWalletTables1718160000001 } from './migrations/1718160000001-AddWalletTables';
import { ValidateTenantIdFKs1718160000002 } from './migrations/1718160000002-ValidateTenantIdFKs';
import { AddRateZoneMatrix1718160000003 } from './migrations/1718160000003-AddRateZoneMatrix';
import { AddOrderRateQuotes1718160000004 } from './migrations/1718160000004-AddOrderRateQuotes';
import { AddNdrCases1718160000005 } from './migrations/1718160000005-AddNdrCases';
import { AddRtoDisputes1718160000006 } from './migrations/1718160000006-AddRtoDisputes';
import { AddKycTables1718160000010 } from './migrations/1718160000010-AddKycTables';
import { AddGstInvoiceTables1718160000011 } from './migrations/1718160000011-AddGstInvoiceTables';
import { AddCodRemittanceTables1718160000013 } from './migrations/1718160000013-AddCodRemittanceTables';
import { AddAuditLogTable1718160000014 } from './migrations/1718160000014-AddAuditLogTable';
import { AddChannelSyncTables1718160000015 } from './migrations/1718160000015-AddChannelSyncTables';

/**
 * TypeORM DataSource factory. Resolved lazily at boot to avoid reading
 * environment variables at module load time (e.g. in tests).
 *
 * Reads from `DATABASE_URL` (Postgres URL). For local development without a
 * database, set `DB_SYNC_ONLY=true` to skip connecting and run with entities
 * defined in memory.
 */
export const buildDataSourceOptions = (): DataSourceOptions => ({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // The entity barrel also re-exports string enums (ShipmentStatus, …),
  // which compile to plain objects and must not reach TypeORM's entity
  // list — keep only class constructors. (SS-fix: the old unfiltered
  // spread produced TS2322 `typeof ShipmentStatus` not assignable.)
  entities: Object.values(entities).filter(
    (e) => typeof e === 'function',
  ) as unknown as DataSourceOptions['entities'],
  // Migrations are ordered by the timestamp prefix in their filenames
  // (1718160000000 before 1718160000001). Add new migrations here, in
  // append order; never re-order or re-number an existing one.
  migrations: [AddTenantId1718160000000, AddWalletTables1718160000001, ValidateTenantIdFKs1718160000002, AddRateZoneMatrix1718160000003, AddOrderRateQuotes1718160000004, AddNdrCases1718160000005, AddRtoDisputes1718160000006, AddKycTables1718160000010, AddGstInvoiceTables1718160000011, AddCodRemittanceTables1718160000013, AddAuditLogTable1718160000014, AddChannelSyncTables1718160000015],
  // In production this is `false` and we use migrations. For development we
  // auto-sync to keep parity with the previous Prisma workflow; CI / staging
  // / prod override with `DB_SYNCHRONIZE=false`.
  synchronize: process.env.DB_SYNCHRONIZE !== 'false',
  logging: process.env.DB_LOGGING === 'true',
  // Allow `null` / `undefined` to be passed through to Postgres for jsonb cols.
  extra: {
    max: Number(process.env.DB_POOL_MAX ?? 20),
    idleTimeoutMillis: 30_000,
  },
});

export const dataSource = new DataSource(buildDataSourceOptions());

// Re-export entity enums for ergonomic imports
export { enums };
export * from './entities';
