/* eslint-env node */
/**
 * Nx jest target for apps/api.
 *
 * Re-created (2026-08) — the project.json `test` target pointed at this file
 * but it was never committed. Mirrors `libs/domains/channels/jest.config.ts`
 * (thin wrapper around the root preset) with the app-level alias mapper the
 * preset's generic `@swiftship/*` rule cannot express
 * (`@swiftship/domains-x` → `libs/domains/x`, `@swiftship/platform-x` →
 * `libs/platform/x`).
 */
export default {
  displayName: 'api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/src/**/*.(spec|test).ts'],
  moduleNameMapper: {
    '^@swiftship/domains-(.*)$': '<rootDir>/../../libs/domains/$1/src/index.ts',
    '^@swiftship/platform-(.*)$': '<rootDir>/../../libs/platform/$1/src/index.ts',
    '^@swiftship/observability$': '<rootDir>/../../libs/observability/src/index.ts',
  },
};
