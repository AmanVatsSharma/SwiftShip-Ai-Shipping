/* eslint-env node */
/**
 * Nx jest target for the @swiftship/domains-payments lib.
 *
 * Thin wrapper around the root jest.preset.js. NOTE: the preset's generic
 * '@swiftship/*' mapper resolves <rootDir>-relative and is wrong for
 * 3-deep libs, so this config defines the full alias set explicitly
 * (preset keys are merged per-key and the generic one would shadow).
 */
export default {
  displayName: 'payments',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/src/**/*.(spec|test).ts'],
  // uuid (and friends) ship ESM that ts-jest must transform.
  transformIgnorePatterns: ['node_modules/(?!(uuid)/)'],
  moduleNameMapper: {
    '^@swiftship/domains-payments$': '<rootDir>/src/index.ts',
    '^@swiftship/domains-(.*)$': '<rootDir>/../../domains/$1/src/index.ts',
    '^@swiftship/platform-(.*)$': '<rootDir>/../../platform/$1/src/index.ts',
    '^@swiftship/observability$': '<rootDir>/../../observability/src/index.ts',
  },
};
