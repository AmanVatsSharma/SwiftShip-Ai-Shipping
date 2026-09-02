// @ts-check
const eslint = require('@eslint/js');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const nx = require('@nx/eslint-plugin');

module.exports = tseslint.config(
  {
    ignores: ['eslint.config.cjs', 'dist/**', 'node_modules/**', '.nx/**', 'tmp/**', 'packages/**'],
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
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
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

            // DOMAIN LAYER (can depend on other domain, platform, types)
            { sourceTag: 'layer:domain', onlyDependOnLibsWithTags: ['layer:domain', 'layer:platform', 'layer:types', 'type:types'] },

            // PLATFORM LAYER (can use other platform, types)
            { sourceTag: 'layer:platform', onlyDependOnLibsWithTags: ['layer:platform', 'layer:types', 'type:types'] },

            // APPS (can import anything)
            { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'scope:admin-portal', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'scope:tenants', onlyDependOnLibsWithTags: ['layer:platform','layer:domain','layer:shared','type:types'] },
            // TOOLS LAYER (loadtest scripts, generators, executors) — leaf,
            // no domain/platform dependencies. The k6 scenarios only talk
            // to the staging API over HTTP; they must not import domain
            // or platform code.
            { sourceTag: 'layer:tools', onlyDependOnLibsWithTags: [] }
          ]
        }
      ]
    },
  },

  // SS-035: k6 scenarios are JS executed by the k6 binary. They
  // deliberately use CommonJS (`require`, `module.exports`) and
  // depend on k6 built-ins that don't have type definitions —
  // eslint's type-checked rules trip on every import. Disable
  // the type-aware rules for these files; the regular JS rules
  // still apply.
  //
  // NOTE (SS-101): these two file-scoped entries were originally pasted
  // *inside* the `rules` object above — a syntax error that made every
  // `nx lint` invocation crash. They are separate flat-config entries now.
  {
    files: ['loadtest/**/*.js', 'loadtest/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },

  // SS-036: chaos scenarios are CommonJS scripts run by Node, not
  // TypeScript. They use the same `require` style as the k6
  // scenarios. Also, ban hardcoded infrastructure endpoints and
  // credentials — the scenarios must be configurable via env vars
  // so they can be pointed at staging or prod.
  {
    files: ['chaos/**/*.js', 'chaos/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^https?:\\/\\/(localhost|127\\.0\\.0\\.1|10\\.|192\\.168\\.)/]",
          message:
            'Hardcoded local URLs are forbidden. Read from env vars (API_BASE_URL, REDIS_URL, etc.).',
        },
        {
          selector: "Literal[value=/postgres:\\/\\/[^\\s'\"]*:[^\\s'\"]*@/]",
          message:
            'Hardcoded Postgres connection strings with credentials are forbidden. Use DATABASE_URL env var.',
        },
      ],
    },
  },
);
