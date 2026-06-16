import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Config } from 'jest';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const tsConfigJson = JSON.parse(
  readFileSync(join(projectRoot, 'tsconfig.app.json'), 'utf8'),
);

const config: Config = {
  displayName: 'api-public',
  testEnvironment: 'node',
  rootDir: projectRoot,
  moduleFileExtensions: ['ts', 'js', 'html', 'json'],
  testRegex: '(.*\\.spec\\.ts)$',
  transform: {
    '^.+\\.(ts|js|html)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.app.json',
        isolatedModules: true,
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    '^@swiftship/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
  },
  coverageDirectory: join(projectRoot, '../../coverage/apps/api-public'),
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!src/**/*.spec.ts',
    '!src/generated/**',
    '!src/main.ts',
  ],
};

export default config;
