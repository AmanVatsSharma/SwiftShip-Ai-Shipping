import { readFileSync } from 'fs';
import { join } from 'path';
import type { Config } from 'jest';

const tsConfig = JSON.parse(
  readFileSync(join(__dirname, 'tsconfig.spec.json'), 'utf8'),
);

export default {
  displayName: 'manifests',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'html'],
  testRegex: '(.*\\.spec\\.ts)$',
  transform: {
    '^.+\\.(ts|js|html)$': [
      'jest-preset-jest',
      { tsconfig: '<rootDir>/tsconfig.spec.json' },
    ],
  },
  moduleNameMapper: {
    '^@swiftship/(.*)$': '<rootDir>/../../$1',
  },
} satisfies Config;
