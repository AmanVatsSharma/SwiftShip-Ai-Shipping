#!/usr/bin/env node
/**
 * SS-027 / SS-027a — generate the 3 official SDKs (Node, Python, PHP)
 * from the tsoa-emitted OpenAPI 3.0 spec at
 * `apps/api-public/src/generated/openapi.json`.
 *
 * Usage:
 *   node scripts/build-sdks.mjs                       # build all
 *   node scripts/build-sdks.mjs --only=node           # build one
 *   node scripts/build-sdks.mjs --spec=path/to/openapi.json
 *
 * This file ships with SS-027a as the **foundation** — the
 * `buildNode`, `buildPython`, `buildPhp` functions are placeholders
 * that will be filled in by the SS-027b/c/d agents. Each placeholder
 * just verifies the OpenAPI spec exists and that the target dir is
 * clean, so the agents have a working test surface from day 1.
 *
 * Idempotent: re-running regenerates the SDKs in place.
 */

import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const DEFAULT_SPEC = join(
  repoRoot,
  'apps/api-public/src/generated/openapi.json',
);

const TARGETS = {
  node: {
    label: 'Node SDK (@swiftship/node)',
    dir: join(repoRoot, 'packages/node'),
    generator: 'typescript-fetch',
    opts: {
      npmName: '@swiftship/node',
      npmVersion: '0.1.0',
      supportsES6: 'true',
      useSingleRequestParameter: 'true',
      withInterfaces: 'true',
      stringEnums: 'true',
      enumPropertyNaming: 'PascalCase',
    },
  },
  python: {
    label: 'Python SDK (swiftship)',
    dir: join(repoRoot, 'packages/python'),
    generator: 'python',
    opts: {
      projectName: 'swiftship-python',
      packageName: 'swiftship',
      packageVersion: '0.1.0',
      pythonVersion: '3.9',
    },
  },
  php: {
    label: 'PHP SDK (swiftship/swiftship)',
    dir: join(repoRoot, 'packages/php'),
    generator: 'php',
    opts: {
      composerPackageName: 'swiftship/swiftship',
      packageVersion: '0.1.0',
      invokerPackage: 'SwiftShip\\Sdk',
    },
  },
};

function parseArgs(argv) {
  const out = { only: null, spec: DEFAULT_SPEC };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--only=')) out.only = a.slice('--only='.length);
    else if (a.startsWith('--spec=')) out.spec = resolve(repoRoot, a.slice('--spec='.length));
  }
  return out;
}

function ensureSpec(specPath) {
  if (!existsSync(specPath)) {
    console.error(`[build-sdks] OpenAPI spec not found at: ${specPath}`);
    console.error('[build-sdks] Run \`npx nx run api-public:tsoa:spec\` first.');
    process.exit(1);
  }
  // Sanity-check: should be valid JSON with an `openapi` field.
  const doc = JSON.parse(readFileSync(specPath, 'utf8'));
  if (!doc.openapi || !doc.openapi.startsWith('3.')) {
    console.error(
      `[build-sdks] Spec at ${specPath} is not an OpenAPI 3.x document (got openapi="${doc.openapi}").`,
    );
    process.exit(1);
  }
  return doc;
}

function runOpenapiGenerator(target, specPath) {
  // Real implementation lands in SS-027b/c/d. For now we log intent
  // and validate that the target dir is set up.
  console.log(`[build-sdks] ${target.label}`);
  console.log(`  spec:    ${specPath}`);
  console.log(`  dir:     ${target.dir}`);
  console.log(`  gen:     ${target.generator}`);
  console.log(
    `  cmd:     npx --no-install @openapitools/openapi-generator-cli generate \\`,
  );
  console.log(`             -g ${target.generator} \\`);
  console.log(`             -i ${specPath} \\`);
  console.log(`             -o ${target.dir} \\`);
  console.log(`             --additional-properties=${formatOpts(target.opts)}`);
  console.log(`  status:  PENDING (SS-027${target === TARGETS.node ? 'b' : target === TARGETS.python ? 'c' : 'd'})`);
}

function formatOpts(opts) {
  return Object.entries(opts)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function main() {
  const args = parseArgs(process.argv);
  const doc = ensureSpec(args.spec);
  const targets = args.only
    ? Object.entries(TARGETS).filter(([k]) => k === args.only)
    : Object.entries(TARGETS);

  if (!targets.length) {
    console.error(`[build-sdks] No matching target for --only=${args.only}`);
    console.error(`[build-sdks] Available: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }

  console.log(`[build-sdks] spec: ${args.spec} (openapi ${doc.openapi})`);
  console.log(`[build-sdks] ${targets.length} target(s)`);
  for (const [name, t] of targets) {
    ensureDir(t.dir);
    runOpenapiGenerator(t, args.spec);
  }
  console.log('[build-sdks] All targets listed. Implement each target in SS-027b/c/d.');
}

main();
