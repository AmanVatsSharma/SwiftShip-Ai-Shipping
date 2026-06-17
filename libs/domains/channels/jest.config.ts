/* eslint-env node */
/**
 * Nx jest target for the @swiftship/domains-channels lib.
 *
 * Mirrors the shape of `libs/observability/jest.config.ts` — a thin
 * wrapper around the root `jest.preset.js` that adds the per-lib
 * module name mapper. The preset owns the ts-jest transformer and the
 * `@swiftship/*` path alias resolver, so this file only needs to
 * point at it.
 */
export default {
  displayName: 'channels',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/src/**/*.(spec|test).ts'],
  moduleNameMapper: {
    '^@swiftship/domains-channels$': '<rootDir>/src/index.ts',
  },
};
