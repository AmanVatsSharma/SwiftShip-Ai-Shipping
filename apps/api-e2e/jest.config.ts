// E2E jest config (TS, ESM-safe — no __dirname / node:fs reads).
// Base shape inlined from the legacy test/jest-e2e.json; the e2e-specific
// bits (testMatch, alias mappers, haste ignores) live here too.
export default {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: '../..',
  // Booting the full AppModule (TypeORM sync + BullMQ workers + GraphQL
  // schema generation) takes ~20-40s on cold caches — well past jest's
  // 5s default for beforeAll hooks.
  testTimeout: 120_000,
  testMatch: ['<rootDir>/apps/api-e2e/src/**/*.e2e-spec.ts'],
  // Build outputs contain copies of the lib package.json files; without
  // this, jest-haste-map sees two packages named `@swiftship/...` and
  // every require of an alias fails in ModuleMap._assertNoDuplicates.
  // `dist/` is the Nx build output; the literal `{workspaceRoot}`
  // directory is a stray Nx-cache artifact.
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
  // here. Keep in sync with tsconfig.base.json.
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
