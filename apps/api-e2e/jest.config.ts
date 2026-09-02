import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Pick up the test Jest config from the repo root (the legacy one) and
// override only the e2e-specific bits. `testRegex` must be dropped —
// Jest refuses a config that sets both testMatch and testRegex.
const { testRegex: _legacyTestRegex, ...base } = JSON.parse(
  readFileSync(join(__dirname, '../../test/jest-e2e.json'), 'utf8'),
);

export default {
  ...base,
  rootDir: '../..',
  testMatch: ['<rootDir>/apps/api-e2e/src/**/*.e2e-spec.ts'],
  // Build outputs contain copies of the lib package.json files; without
  // this, jest-haste-map sees two packages named `@swiftship/...` and
  // every require of an alias fails in ModuleMap._assertNoDuplicates
  // (jest-runtime lookups the raw module name in the haste map before
  // moduleNameMapper even runs). `dist/` is the Nx build output; the
  // literal `{workspaceRoot}` directory is a stray Nx-cache artifact.
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/\\{workspaceRoot\\}/',
  ],
  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/\\{workspaceRoot\\}/'],
  globalSetup: '<rootDir>/apps/api-e2e/src/jest.global-setup.ts',
  globalTeardown: '<rootDir>/apps/api-e2e/src/jest.global-teardown.ts',
  // ts-jest defaults to the tsconfig nearest the jest rootDir (the legacy
  // root tsconfig.json, which has no `@swiftship/*` path mappings). Point
  // it at this project's tsconfig (extends tsconfig.base.json) so the
  // alias imports typecheck with the same paths tsc uses.
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { tsconfig: '<rootDir>/apps/api-e2e/tsconfig.json' },
    ],
  },
  // The AppModule (apps/api/src) imports domain/platform libs via the
  // `@swiftship/*` tsconfig path aliases. ts-jest does not rewrite path
  // aliases, so mirror the relevant subset of tsconfig.base.json `paths`
  // here. Keep in sync with tsconfig.base.json. (Fix is scoped to this
  // jest config per the e2e workstream — apps/libs configs are untouched.)
  // NOTE: the legacy bare aliases ("graphql", "auth", "queues", …) are
  // deliberately NOT mapped — nothing in the AppModule import graph uses
  // them, and mapping e.g. '^graphql$' would hijack the real `graphql`
  // npm package inside node_modules.
  moduleNameMapper: {
    '^@swiftship/observability$': '<rootDir>/libs/observability/src/index.ts',
    '^@swiftship/domains-(.*)$': '<rootDir>/libs/domains/$1/src/index.ts',
    '^@swiftship/platform-(.*)$': '<rootDir>/libs/platform/$1/src/index.ts',
    '^@swiftship/shared-ui$': '<rootDir>/libs/shared-ui/src/index.ts',
    '^@swiftship/domains/(.*)$': '<rootDir>/libs/domains/$1/src/index.ts',
    '^@swiftship/shared/(.*)$': '<rootDir>/libs/shared/$1/src/index.ts',
    '^@swiftship/platform/(.*)$': '<rootDir>/libs/platform/$1/src/index.ts',
  },
};
