#!/usr/bin/env node
/**
 * scripts/audit-prisma-compat.mjs
 *
 * Static guard for the Prisma -> TypeORM migration (SS-040).
 *
 * Prevents any new `@prisma/client` or `PrismaCompat` import from being
 * added to the repo. The shim is being removed (1 lib/week) but without
 * a guard, the cadence is meaningless.
 *
 * What it does:
 *   1. Walks every `src/` under `libs/domains/*` and `libs/platform/*`.
 *   2. Greps each file for `PrismaCompat` and `@prisma/client`.
 *   3. Excludes the known shim files in `libs/platform/typeorm/`:
 *        - libs/platform/typeorm/src/lib/prisma-compat.types.ts
 *        - libs/platform/typeorm/src/lib/@prisma/client/index.d.ts
 *        - libs/platform/typeorm/src/lib/@prisma/client/runtime.d.ts
 *   4. Prints a count of offending matches per lib (or per shim file when
 *      the match is inside the shim itself, so the operator can see the
 *      baseline).
 *   5. Exits 1 if any consumer import is found outside the shim files;
 *      exits 0 otherwise.
 *
 * Usage:
 *   node scripts/audit-prisma-compat.mjs
 *   npm run audit:prisma
 *
 * Exit codes:
 *   0 = clean (no consumer imports found)
 *   1 = at least one consumer import was found
 *
 * Notes:
 *   - The script only inspects `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`,
 *     `.cjs`, and `.d.ts` files. node_modules / dist are skipped.
 *   - Comments that mention `PrismaCompat` are NOT filtered out — the goal
 *     is to ban the symbol entirely from consumer code. If you need to
 *     reference the shim in a comment, link to MIGRATION.md instead.
 *   - The script intentionally does NOT scan `apps/` (apps are composition
 *     roots; the shim's exported helpers like `configurePrismaCompat` are
 *     valid app-level imports and will be dropped in SS-044). If you
 *     need an app-level audit, run grep directly.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Patterns to flag. Both `PrismaCompat` and any `@prisma/client` import.
const PATTERNS = [
  { name: 'PrismaCompat', regex: /PrismaCompat/g },
  { name: '@prisma/client', regex: /@prisma\/client/g },
];

// Files inside the shim that are allowed to mention the patterns. These are
// the implementation of the shim itself, not consumers of it.
const SHIM_FILES = new Set(
  [
    'libs/platform/typeorm/src/lib/prisma-compat.types.ts',
    'libs/platform/typeorm/src/lib/@prisma/client/index.d.ts',
    'libs/platform/typeorm/src/lib/@prisma/client/runtime.d.ts',
  ].map((p) => p.split('/').join(sep)),
);

const SCAN_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.d.ts',
]);

const SCAN_DIRS = ['libs/domains', 'libs/platform'];

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

/**
 * Recursively walk `dir`, yielding absolute file paths whose extension is in
 * SCAN_EXTENSIONS. Skips `node_modules`, `dist`, `coverage`, `.nx`.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;

  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage' || entry === '.nx') {
      continue;
    }
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (st.isFile()) {
      const dot = entry.lastIndexOf('.');
      if (dot >= 0 && SCAN_EXTENSIONS.has(entry.slice(dot))) {
        out.push(full);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-file scan
// ---------------------------------------------------------------------------

/**
 * @param {string} absPath
 * @returns {{ name: string, line: number, col: number, pattern: string }[]}
 */
function scanFile(absPath) {
  const text = readFileSync(absPath, 'utf-8');
  const hits = [];
  for (const { name, regex } of PATTERNS) {
    // Use a fresh regex per scan to avoid lastIndex bleed.
    const re = new RegExp(regex.source, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(0, m.index);
      const line = (before.match(/\n/g) ?? []).length + 1;
      const col = m.index - (before.lastIndexOf('\n') + 1) + 1;
      hits.push({ name, line, col, pattern: m[0] });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Group scanned files by their parent lib, where "lib" is the directory
 * inside `libs/domains` or `libs/platform` that contains the file.
 *
 * Examples:
 *   libs/domains/billing/src/lib/billing.service.ts -> domains/billing
 *   libs/platform/typeorm/src/lib/prisma-compat.types.ts -> platform/typeorm
 */
function libName(absPath) {
  const rel = relative(ROOT, absPath).split(sep).join('/');
  const parts = rel.split('/');
  // parts[0] is 'libs'
  if (parts[1] !== 'domains' && parts[1] !== 'platform') {
    return rel;
  }
  return `${parts[1]}/${parts[2]}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = () => {
  /** @type {Map<string, { hits: { file: string, line: number, col: number, pattern: string }[], shim: boolean }>} */
  const byLib = new Map();
  /** @type {Map<string, number>} */
  const shimTotals = new Map();

  for (const dir of SCAN_DIRS) {
    const absDir = join(ROOT, dir);
    if (!existsSync(absDir)) continue;
    for (const file of walk(absDir)) {
      const rel = relative(ROOT, file).split(sep).join('/');
      const isShim = SHIM_FILES.has(rel);

      const hits = scanFile(file);
      if (hits.length === 0) continue;

      if (isShim) {
        shimTotals.set(rel, (shimTotals.get(rel) ?? 0) + hits.length);
        continue;
      }

      const lib = libName(file);
      const bucket = byLib.get(lib) ?? { hits: [], shim: false };
      for (const h of hits) {
        bucket.hits.push({ file: rel, line: h.line, col: h.col, pattern: h.pattern });
      }
      byLib.set(lib, bucket);
    }
  }

  // Sort libs alphabetically for stable output.
  const libKeys = Array.from(byLib.keys()).sort();

  const totalConsumerHits = libKeys.reduce(
    (acc, k) => acc + byLib.get(k).hits.length,
    0,
  );

  // Per-pattern breakdown for the consumer hits.
  /** @type {Record<string, number>} */
  const patternCounts = {};
  for (const { name } of PATTERNS) patternCounts[name] = 0;
  for (const k of libKeys) {
    for (const h of byLib.get(k).hits) {
      patternCounts[h.name] = (patternCounts[h.name] ?? 0) + 1;
    }
  }

  console.log('PrismaCompat audit (SS-040)');
  console.log('===========================');
  console.log('');

  if (libKeys.length === 0) {
    console.log('Consumer matches: 0');
    console.log('');
    console.log('No @prisma/client or PrismaCompat imports found in libs/*/src.');
  } else {
    console.log(`Consumer matches: ${totalConsumerHits}`);
    console.log('');
    for (const k of libKeys) {
      const { hits } = byLib.get(k);
      console.log(`  ${k}: ${hits.length}`);
      for (const h of hits) {
        console.log(`    - ${h.file}:${h.line}:${h.col}  (${h.pattern})`);
      }
    }
    console.log('');
    console.log('Per-pattern totals:');
    for (const p of PATTERNS) {
      console.log(`  ${p.name}: ${patternCounts[p.name]}`);
    }
  }

  if (shimTotals.size > 0) {
    console.log('');
    console.log('Shim file matches (excluded from the failure check):');
    for (const [file, count] of shimTotals.entries()) {
      console.log(`  ${file}: ${count}`);
    }
  }

  console.log('');

  if (totalConsumerHits > 0) {
    console.error('FAIL: new PrismaCompat / @prisma/client consumer imports detected.');
    console.error('');
    console.error('The PrismaCompat shim is being removed (1 lib/week, see MIGRATION.md).');
    console.error('Do not add new consumers. If you are migrating a service off the');
    console.error('shim, see MIGRATION.md section 7 for the runbook.');
    console.error('');
    console.error('If a match is inside a comment, link to MIGRATION.md instead of');
    console.error('naming the symbol.');
    process.exit(1);
  }

  console.log('OK: 0 consumer matches. Shim is still in place (SS-040 baseline).');
  process.exit(0);
};

main();
