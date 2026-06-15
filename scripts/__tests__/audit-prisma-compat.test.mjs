#!/usr/bin/env node
/**
 * scripts/__tests__/audit-prisma-compat.test.mjs
 *
 * Unit tests for scripts/audit-prisma-compat.mjs (SS-047).
 *
 * Run with:
 *   node --test scripts/__tests__/audit-prisma-compat.test.mjs
 *
 * No external dependencies — uses node's built-in test runner + assert.
 *
 * The tests exercise the exported helpers (`stripComments`, `scanFile`)
 * plus a self-contained re-implementation of the file-walk + aggregation
 * pass that consumes the same SHIM_FILES / PATTERNS semantics. This
 * re-implementation (runAuditForFiles) is the function the script's
 * `main()` builds up internally; we mirror it here so the tests don't
 * have to fork the running process to inspect results.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs';
import { join, sep, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import {
  stripComments,
  scanFile,
} from '../audit-prisma-compat.mjs';

// ---------------------------------------------------------------------------
// Mirror of the script's scan-aggregation logic, exposed for tests.
// Keeps the test file independent of the script's `process.exit`.
// ---------------------------------------------------------------------------

const PATTERNS = [
  { name: 'PrismaCompat', regex: /PrismaCompat/g },
  { name: '@prisma/client', regex: /@prisma\/client/g },
];

const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.mjs', '.cjs', '.d.ts',
]);

/**
 * Walk a single directory recursively, yielding file paths with the
 * extensions the audit script scans.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
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

/**
 * Re-implementation of the script's main loop, parameterized on:
 *   - `roots`: directories to scan
 *   - `shimFiles`: set of relative paths to treat as shim-internal
 *   - `isShim`: optional override (defaults to "is the file's relative
 *     path inside shimFiles"). This lets us point at a tempdir where the
 *     shim lives at an arbitrary relative path.
 *
 * @param {{ roots: string[], shimFiles: Set<string> }} cfg
 * @returns {{
 *   consumerHits: number,
 *   shimHits: number,
 *   consumerByFile: Map<string, number>,
 *   shimByFile: Map<string, number>,
 * }}
 */
function runAuditForFiles({ roots, shimFiles }) {
  const consumerByFile = new Map();
  const shimByFile = new Map();
  let consumerHits = 0;
  let shimHits = 0;
  for (const root of roots) {
    for (const file of walk(root)) {
      const isShim = shimFiles.has(file.split(sep).join('/'));
      const hits = scanFile(file);
      if (hits.length === 0) continue;
      if (isShim) {
        shimByFile.set(file, (shimByFile.get(file) ?? 0) + hits.length);
        shimHits += hits.length;
      } else {
        consumerByFile.set(file, (consumerByFile.get(file) ?? 0) + hits.length);
        consumerHits += hits.length;
      }
    }
  }
  return { consumerHits, shimHits, consumerByFile, shimByFile };
}

// ---------------------------------------------------------------------------
// Tests for the comment-stripping primitive
// ---------------------------------------------------------------------------

describe('stripComments', () => {
  test('strips single-line // comments', () => {
    const src = 'const a = 1;\n// PrismaCompat mention\nconst b = 2;';
    const out = stripComments(src);
    assert.equal(out.includes('PrismaCompat'), false);
    // line count preserved
    assert.equal(out.split('\n').length, 3);
  });

  test('strips /* ... */ block comments', () => {
    const src = 'const a = 1;\n/* PrismaCompat block */\nconst b = 2;';
    const out = stripComments(src);
    assert.equal(out.includes('PrismaCompat'), false);
    assert.equal(out.split('\n').length, 3);
  });

  test('strips JSDoc /** ... */ blocks', () => {
    const src = [
      '/**',
      ' * Uses the PrismaCompat shim.',
      ' * See MIGRATION.md.',
      ' */',
      'export const x = 1;',
    ].join('\n');
    const out = stripComments(src);
    assert.equal(out.includes('PrismaCompat'), false);
  });

  test('preserves code that is NOT a comment', () => {
    const src = 'import { PrismaCompat } from "@swiftship/platform-typeorm";';
    const out = stripComments(src);
    assert.ok(out.includes('PrismaCompat'));
  });

  test('preserves line numbers when removing a block comment', () => {
    const src = [
      'line1',                // 1
      '/* multi',             // 2
      '   line',              // 3
      '   comment */ rest',   // 4
      'line5',                // 5
    ].join('\n');
    const out = stripComments(src);
    assert.equal(out.split('\n').length, 5);
    assert.equal(out.split('\n')[0], 'line1');
    assert.equal(out.split('\n')[4], 'line5');
  });
});

// ---------------------------------------------------------------------------
// End-to-end style tests on a temp directory
// ---------------------------------------------------------------------------

describe('audit (end-to-end via tempdir)', () => {
  /** @type {string} */
  let tmp;
  /** @type {string} */
  let shimRelPath;
  /** @type {string} */
  let shimAbsPath;

  const makeFixture = (filename, contents) => {
    const abs = join(tmp, filename);
    // Ensure parent dir exists. Use recursive mkdirSync directly.
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
    return abs;
  };

  // Run once: create a fresh tmpdir before each test for isolation.
  test.beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'audit-prisma-test-'));
  });

  test.afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test('match in a consumer .ts file -> 1 consumer match', () => {
    makeFixture(
      'libs/domains/foo/src/lib/foo.service.ts',
      'import { PrismaCompat } from "@swiftship/platform-typeorm";\n',
    );
    // No shim file at all — shim set is empty.
    const shimFiles = new Set();
    const result = runAuditForFiles({ roots: [tmp], shimFiles });
    assert.equal(result.consumerHits, 1);
    assert.equal(result.shimHits, 0);
  });

  test('match in a comment line -> 0 consumer matches', () => {
    makeFixture(
      'libs/domains/bar/src/lib/bar.service.ts',
      [
        '// TODO: remove PrismaCompat reference after MIGRATION.md lands',
        'export const x = 1;',
        '',
      ].join('\n'),
    );
    const result = runAuditForFiles({
      roots: [tmp],
      shimFiles: new Set(),
    });
    assert.equal(result.consumerHits, 0);
  });

  test('match in a JSDoc block -> 0 consumer matches', () => {
    makeFixture(
      'libs/domains/baz/src/lib/baz.service.ts',
      [
        '/**',
        ' * This service used the PrismaCompat shim.',
        ' * See MIGRATION.md for the migration runbook.',
        ' */',
        'export const x = 1;',
        '',
      ].join('\n'),
    );
    const result = runAuditForFiles({
      roots: [tmp],
      shimFiles: new Set(),
    });
    assert.equal(result.consumerHits, 0);
  });

  test('match inside the shim file -> 0 consumer matches, shim-internal counted', () => {
    shimRelPath = 'libs/platform/typeorm/src/lib/prisma-compat.types.ts';
    shimAbsPath = makeFixture(
      shimRelPath,
      [
        'export class PrismaCompat {',
        '  static doThing() { return 1; }',
        '  static anotherPrismaCompatRef() { return 2; }',
        '}',
        '',
      ].join('\n'),
    );
    const shimFiles = new Set([shimAbsPath.split(sep).join('/')]);
    const result = runAuditForFiles({ roots: [tmp], shimFiles });
    assert.equal(result.consumerHits, 0);
    assert.equal(result.shimHits, 2);
  });

  test('no matches anywhere -> 0 consumer matches', () => {
    makeFixture(
      'libs/domains/clean/src/lib/clean.service.ts',
      [
        'import { InjectRepository } from "@nestjs/typeorm";',
        'export const x = 1;',
        '',
      ].join('\n'),
    );
    const result = runAuditForFiles({
      roots: [tmp],
      shimFiles: new Set(),
    });
    assert.equal(result.consumerHits, 0);
    assert.equal(result.shimHits, 0);
  });

  test('exit code semantics: 0 when no consumer matches, 1 when there are', () => {
    // Consumer present
    makeFixture(
      'libs/domains/x/src/lib/x.service.ts',
      'import { PrismaCompat } from "@swiftship/platform-typeorm";\n',
    );
    const dirty = runAuditForFiles({
      roots: [tmp],
      shimFiles: new Set(),
    });
    const exitCodeDirty = dirty.consumerHits > 0 ? 1 : 0;
    assert.equal(exitCodeDirty, 1);

    // Clean tree: remove the consumer file
    rmSync(join(tmp, 'libs/domains/x/src/lib/x.service.ts'), { force: true });
    const clean = runAuditForFiles({
      roots: [tmp],
      shimFiles: new Set(),
    });
    const exitCodeClean = clean.consumerHits > 0 ? 1 : 0;
    assert.equal(exitCodeClean, 0);
  });
});

// ---------------------------------------------------------------------------
// Real-code probes against the script's source itself.
// ---------------------------------------------------------------------------

describe('script source-level checks', () => {
  test('script declares --json flag and SHIM_FILES is non-empty', async () => {
    // Lazy-read the script via dynamic import + textual grep.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const scriptPath = join(here, '..', 'audit-prisma-compat.mjs');
    const src = readFileSync(scriptPath, 'utf-8');
    assert.match(src, /--json/, 'script should advertise a --json flag');
    assert.match(
      src,
      /SHIM_FILES\s*=\s*new Set/,
      'script should maintain a SHIM_FILES set',
    );
    assert.match(
      src,
      /stripComments/,
      'script should export a comment-stripping helper',
    );
  });
});
