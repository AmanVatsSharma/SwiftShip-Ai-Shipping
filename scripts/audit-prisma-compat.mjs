#!/usr/bin/env node
/**
 * scripts/audit-prisma-compat.mjs
 *
 * Static guard for the Prisma -> TypeORM migration (SS-040, SS-047).
 *
 * Prevents any new `@prisma/client` or `PrismaCompat` consumer import from
 * being added to the repo. The shim is being removed (1 lib/week) but
 * without a guard, the cadence is meaningless.
 *
 * What it does:
 *   1. Walks every `src/` under `libs/domains/*` and `libs/platform/*`.
 *   2. Strips `//` line comments and `/* ... *\/` block comments from each
 *      file before searching, so JSDoc and `// link to PrismaCompat in
 *      MIGRATION.md` style comments don't produce false positives.
 *   3. Greps the comment-stripped text for `PrismaCompat` and
 *      `@prisma/client`.
 *   4. Separates matches into:
 *        - "consumer" matches: any file OUTSIDE the shim.
 *        - "shim-internal" matches: matches inside the shim file(s). These
 *          are reported for visibility but never fail the build.
 *   5. Exits 1 if any consumer import is found; exits 0 otherwise.
 *
 * Usage:
 *   node scripts/audit-prisma-compat.mjs
 *   node scripts/audit-prisma-compat.mjs --json
 *   node scripts/audit-prisma-compat.mjs <path>
 *   node scripts/audit-prisma-compat.mjs --json <path>
 *   npm run audit:prisma
 *
 * Exit codes:
 *   0 = clean (no consumer imports found)
 *   1 = at least one consumer import was found
 *
 * Notes:
 *   - The script only inspects `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`,
 *     `.cjs`, and `.d.ts` files. node_modules / dist are skipped.
 *   - The script intentionally does NOT scan `apps/` (apps are composition
 *     roots; the shim's exported helpers like `configurePrismaCompat` are
 *     valid app-level imports and will be dropped in SS-044). If you need
 *     an app-level audit, run grep directly.
 *   - `--json` emits a single-line JSON object to stdout (suitable for
 *     `node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))'` in CI).
 *     All human-readable text is suppressed when `--json` is set.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * @returns {{ json: boolean, scanRoot: string }}
 */
function parseArgs(argv) {
  let json = false;
  let scanRoot = ROOT;
  for (const arg of argv) {
    if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/audit-prisma-compat.mjs [--json] [<path>]',
      );
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      scanRoot = arg;
    }
  }
  return { json, scanRoot };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Patterns to flag. Both `PrismaCompat` and any `@prisma/client` import.
const PATTERNS = [
  { name: 'PrismaCompat', regex: /PrismaCompat/g },
  { name: '@prisma/client', regex: /@prisma\/client/g },
];

// Files inside the shim that are allowed to mention the patterns. These are
// the implementation of the shim itself (and the shim's own unit tests),
// not consumers of it. Add to this set when a new shim-internal file is
// created; do NOT add domain lib files here.
//
// SS-044: The PrismaCompat shim was deleted entirely. The set is now empty
// (replaced by tenant-context.helpers.ts which uses no PrismaCompat symbols).
// The set + shimTotals reporting is kept in case a future shim is added.
const SHIM_FILES = new Set(
  [
    // 'libs/platform/typeorm/src/lib/prisma-compat.types.ts', // SS-044 deleted
    // 'libs/platform/typeorm/src/lib/typeorm.module.ts',      // re-export only
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

// Default scan dirs (used when scanRoot === ROOT, i.e. no path argument).
const DEFAULT_SCAN_DIRS = ['libs/domains', 'libs/platform'];

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
    if (
      entry === 'node_modules' ||
      entry === 'dist' ||
      entry === 'coverage' ||
      entry === '.nx'
    ) {
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
// Comment stripping
// ---------------------------------------------------------------------------

/**
 * Strip `//` line comments and `/* ... *\/` block comments from a TypeScript
 * source string. Preserves line counts (block-comment removals replace with
 * newlines) so any subsequent line/column reporting stays anchored to the
 * original source.
 *
 * This is intentionally not a full parser — it's a regex-based stripper
 * good enough for audit purposes. It does NOT handle:
 *   - `//` inside a string literal  (false negative risk: low)
 *   - `/*` inside a string literal  (false negative risk: low)
 *   - nested block comments         (TS doesn't allow them anyway)
 * The cost of any false positive from a string literal is a single manual
 * "this is in a string, not a comment" triage — acceptable for a CI guard.
 *
 * @param {string} src
 * @returns {string}
 */
export function stripComments(src) {
  // Block comments first (greedy across newlines). Replace with newlines
  // so line numbers stay aligned.
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
  // Line comments to end of line. Replace with spaces (preserves \n).
  out = out.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  return out;
}

// ---------------------------------------------------------------------------
// Per-file scan
// ---------------------------------------------------------------------------

/**
 * Scan a single file for PATTERNS, ignoring matches inside comments.
 *
 * @param {string} absPath
 * @returns {{ name: string, line: number, col: number, pattern: string }[]}
 */
export function scanFile(absPath) {
  const text = readFileSync(absPath, 'utf-8');
  const cleaned = stripComments(text);
  const hits = [];
  for (const { name, regex } of PATTERNS) {
    // Use a fresh regex per scan to avoid lastIndex bleed.
    const re = new RegExp(regex.source, 'g');
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      const before = cleaned.slice(0, m.index);
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
  const { json, scanRoot } = parseArgs(process.argv.slice(2));
  const scanRoots =
    scanRoot === ROOT
      ? DEFAULT_SCAN_DIRS.map((d) => join(ROOT, d))
      : [scanRoot];

  /** @type {Map<string, { hits: { file: string, line: number, col: number, pattern: string }[] }>} */
  const consumerByLib = new Map();
  /** @type {Map<string, number>} */
  const shimTotals = new Map();

  for (const absDir of scanRoots) {
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
      const bucket = consumerByLib.get(lib) ?? { hits: [] };
      for (const h of hits) {
        bucket.hits.push({
          file: rel,
          line: h.line,
          col: h.col,
          pattern: h.pattern,
        });
      }
      consumerByLib.set(lib, bucket);
    }
  }

  // Sort libs alphabetically for stable output.
  const libKeys = Array.from(consumerByLib.keys()).sort();

  const totalConsumerHits = libKeys.reduce(
    (acc, k) => acc + consumerByLib.get(k).hits.length,
    0,
  );

  // Per-pattern breakdown for the consumer hits.
  /** @type {Record<string, number>} */
  const patternCounts = {};
  for (const { name } of PATTERNS) patternCounts[name] = 0;
  for (const k of libKeys) {
    for (const h of consumerByLib.get(k).hits) {
      patternCounts[h.name] = (patternCounts[h.name] ?? 0) + 1;
    }
  }

  if (json) {
    const payload = {
      consumerMatches: totalConsumerHits,
      consumerByLib: Object.fromEntries(
        libKeys.map((k) => [
          k,
          consumerByLib.get(k).hits.map((h) => ({
            file: h.file,
            line: h.line,
            col: h.col,
            pattern: h.pattern,
          })),
        ]),
      ),
      patternCounts,
      shimInternal: Object.fromEntries(shimTotals.entries()),
      status: totalConsumerHits > 0 ? 'FAIL' : 'OK',
    };
    process.stdout.write(JSON.stringify(payload) + '\n');
    process.exit(totalConsumerHits > 0 ? 1 : 0);
  }

  console.log('PrismaCompat audit (SS-040 / SS-047)');
  console.log('====================================');
  console.log('');

  if (libKeys.length === 0) {
    console.log('Consumer matches: 0');
    console.log('');
    console.log(
      'No @prisma/client or PrismaCompat imports found in the scan root.',
    );
  } else {
    console.log(`Consumer matches: ${totalConsumerHits}`);
    console.log('');
    for (const k of libKeys) {
      const { hits } = consumerByLib.get(k);
      console.log(`  ${k}: ${hits.length}`);
      for (const h of hits) {
        console.log(
          `    - ${h.file}:${h.line}:${h.col}  (${h.pattern})`,
        );
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
    console.log(
      'Shim-internal matches (excluded from the failure check):',
    );
    for (const [file, count] of shimTotals.entries()) {
      console.log(`  ${file}: ${count}`);
    }
  }

  console.log('');

  if (totalConsumerHits > 0) {
    console.error(
      'FAIL: new PrismaCompat / @prisma/client consumer imports detected.',
    );
    console.error('');
    console.error(
      'The PrismaCompat shim is being removed (1 lib/week, see MIGRATION.md).',
    );
    console.error(
      'Do not add new consumers. If you are migrating a service off the',
    );
    console.error('shim, see MIGRATION.md section 7 for the runbook.');
    process.exit(1);
  }

  console.log('OK: 0 consumer matches. PrismaCompat shim is deleted (SS-044).');
  process.exit(0);
};

// Only auto-run main() when this module is the entrypoint (i.e. invoked
// via `node scripts/audit-prisma-compat.mjs`). When imported from a test
// file, the helpers (stripComments, scanFile) are exposed for testing
// without spinning up the full audit + process.exit.
const isEntrypoint = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  main();
}
