/* eslint-env node */
export default {
  displayName: 'rate-cache',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.(spec|test).ts'],
  moduleNameMapper: {
    '^@swiftship/platform-(.*)$': '<rootDir>/../../platform/$1/src/index.ts',
    '^@swiftship/domains-(.*)$': '<rootDir>/../../domains/$1/src/index.ts',
    '^@swiftship/observability$': '<rootDir>/../../observability/src/index.ts',
  },
};
