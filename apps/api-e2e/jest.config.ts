import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Pick up the test Jest config from the repo root (the legacy one) and
// override only the e2e-specific bits.
const base = JSON.parse(
  readFileSync(join(__dirname, '../../test/jest-e2e.json'), 'utf8'),
);

export default {
  ...base,
  rootDir: '../..',
  testMatch: ['<rootDir>/apps/api-e2e/src/**/*.e2e-spec.ts'],
  globalSetup: '<rootDir>/apps/api-e2e/src/jest.global-setup.ts',
  globalTeardown: '<rootDir>/apps/api-e2e/src/jest.global-teardown.ts',
};
