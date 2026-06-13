import { DataSource, DataSourceOptions } from 'typeorm';
import * as entities from './entities';
import * as enums from './enums';

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
  entities: Object.values(entities),
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
