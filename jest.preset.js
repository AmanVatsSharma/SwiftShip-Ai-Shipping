/* eslint-env node */
/**
 * Nx jest preset for per-library test targets.
 *
 * `nx test <lib>` resolves a per-lib `jest.config.ts` that points at this
 * file via `preset: '<rootDir>/../../jest.preset.js'`. We keep the test
 * runner minimal here — environment, transformer, and module resolution
 * are intentionally generic so each lib can layer its own overrides.
 */
module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@swiftship/(.*)$': '<rootDir>/libs/$1',
  },
  testMatch: ['<rootDir>/src/**/*.(spec|test).ts'],
  passWithNoTests: true,
};
