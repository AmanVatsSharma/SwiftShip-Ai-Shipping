/**
 * @prisma/client shim — re-exports the Prisma enum types that legacy services
 * still import from `@prisma/client`. The shim's runtime is TypeORM entities;
 * only the enum type names are kept for the migration window.
 *
 * tsconfig.base.json maps the import path `@prisma/client` to this file.
 * Plan 5 will delete this shim after all services are migrated.
 */
export * from '../../../src/lib/enums';

// PrismaClient is referenced by the legacy PrismaService. We don't need a
// real implementation — the shim in src/prisma/prisma.service.ts replaces it.
export declare class PrismaClient {
  constructor(opts?: any);
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  [k: string]: any;
}
