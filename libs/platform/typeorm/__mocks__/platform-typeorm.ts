// Re-exports everything except datasource (which has a strict TypeORM type
// incompatibility that surfaces under ts-jest). Test files that import from
// @swiftship/platform-typeorm will receive this mock via Jest's
// moduleNameMapper.

// Re-export enums as const objects so the values compare correctly.
export { NdrCaseStatus, ShipmentStatus } from './lib/enums';

// Re-export entities with @Entity etc. — these are plain classes with
// decorators and are safe to use in mocks.
export * from './lib/entities';

// Re-export the TypeOrmModule (the NestJS wrapper).
export { TypeOrmModule } from '@nestjs/typeorm';

// Re-export the module itself so the platform-typeorm barrel consumers
// that only need TypeOrmModule.forFeature keep working.
export { TypeOrmModule as default } from '@nestjs/typeorm';

// Do NOT re-export from datasource.ts — that file has a type-level
// incompatibility (ShipmentStatus enum in entities[] triggers TS2322).
