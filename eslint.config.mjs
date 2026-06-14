// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import nx from '@nx/eslint-plugin';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'node_modules/**', '.nx/**', 'tmp/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 5,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      '@nx': nx,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // Plan 5 enforcement: ban direct Prisma imports outside the compat shim.
      // Libs should use `@swiftship/platform-typeorm` instead.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '@prisma/client/runtime/library'],
              message:
                'Do not import from @prisma/client — use @swiftship/platform-typeorm or the entities/enums re-exports.',
            },
          ],
        },
      ],
      {
        files: [
          'libs/platform/typeorm/src/lib/@prisma/**/*',
          'src/prisma/**/*',
        ],
        rules: {
          'no-restricted-imports': 'off',
        },
      },

      // Nx boundary enforcement - WARNINGS in Plan 1, will become ERRORS in Plan 5
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allowCircularSelfDependency: false,
          depConstraints: [
            // TYPES LAYER (leaf, no dependencies)
            { sourceTag: 'layer:types', onlyDependOnLibsWithTags: [] },

            // DATA-ACCESS LAYER (types + platform only)
            { sourceTag: 'layer:data-access', onlyDependOnLibsWithTags: ['layer:types', 'layer:platform', 'type:types'] },

            // API LAYER (data-access, types, platform)
            { sourceTag: 'layer:api', onlyDependOnLibsWithTags: ['layer:data-access', 'layer:types', 'layer:platform', 'layer:utils'] },

            // UI LAYER (types, utils, other UI within scope)
            { sourceTag: 'layer:ui', onlyDependOnLibsWithTags: ['layer:types', 'layer:utils', 'layer:ui'] },

            // PLATFORM LAYER (can use other platform, types)
            { sourceTag: 'layer:platform', onlyDependOnLibsWithTags: ['layer:platform', 'layer:types', 'type:types'] },

            // APPS (can import anything)
            { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'scope:admin-portal', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'scope:tenants', onlyDependOnLibsWithTags: ['layer:platform','layer:domain','layer:shared','type:types'] }
          ]
        }
      ]
    },
  },
);
