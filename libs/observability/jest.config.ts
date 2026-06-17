/* eslint-env node */
export default {
  displayName: 'observability',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/src/**/*.(spec|test).ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@swiftship/observability$': '<rootDir>/src/index.ts',
  },
};
