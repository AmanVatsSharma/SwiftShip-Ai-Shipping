#!/usr/bin/env node
/**
 * SS-027 / SS-027a — generate the 3 official SDKs (Node, Python, PHP)
 * from the tsoa-emitted OpenAPI 3.0 spec at
 * `apps/api-public/src/generated/openapi.json`.
 *
 * Usage:
 *   node scripts/build-sdks.mjs                       # build all
 *   node scripts/build-sdks.mjs --only=node           # build one
 *   node scripts/build-sdks.mjs --only=php            # build the PHP SDK
 *   node scripts/build-sdks.mjs --spec=path/to/openapi.json
 *
 * Each target runs `npx --no-install @openapitools/openapi-generator-cli
 * generate` with the right `-g` template and `--additional-properties`.
 * Idempotent: re-running regenerates the SDKs in place.
 *
 * SS-027a shipped this file with three placeholder log-and-return paths
 * (Node, Python, PHP). SS-027b (Node) and SS-027c (Python) replaced
 * their placeholders with real `execFileSync` calls. SS-027d (PHP) does
 * the same AND introduces a dedicated `buildPHP()` wrapper that
 * snapshots the hand-rolled composer.json / README.md / src/Client.php
 * / tests/* files, runs the generic generator, then restores the
 * hand-rolled files on top of the generated `lib/` — same pattern as
 * `buildNode()`. SS-027c also adds a `javaOnPath()` preflight so the
 * build fails fast with a clear "install a JDK" message instead of the
 * opaque "'java' is not recognized" error the OpenAPI Generator JAR
 * emits.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

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
    label: 'PHP SDK (swiftship/sdk-php)',
    dir: join(repoRoot, 'packages/php'),
    generator: 'php',
    opts: {
      // SS-027d: the canonical composer package name on Packagist is
      // `swiftship/sdk-php` (kept in sync with the hand-authored
      // composer.json + the `--composerPackageName` flag the generator
      // uses to write its OWN `composer.json` under lib/). The
      // invokerPackage stays under `Swiftship\\Sdk\\` so the public
      // PHP namespace for the hand-rolled Client wrapper is
      // `Swiftship\Sdk\Client` (matches the bead spec).
      composerPackageName: 'swiftship/sdk-php',
      packageName: 'swiftship-sdk',
      packageVersion: '0.1.0',
      invokerPackage: 'Swiftship\\Sdk',
      sinksPackage: 'Swiftship\\Sinks',
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
    console.error('[build-sdks] Run `npx nx run api-public:tsoa:spec` first.');
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

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Build one target by shelling out to `@openapitools/openapi-generator-cli`.
 * Throws (with stderr on failure) so the caller can decide whether to
 * bubble up the error.
 */
function buildTarget(target, specPath) {
  // SS-027b: the openapi-generator-cli lives as a devDep of apps/api-public
  // (see apps/api-public/package.json). It is intentionally NOT a root
  // devDep, so we look in apps/api-public/node_modules/.bin/ first.
  const candidates = [
    resolve(repoRoot, 'apps/api-public/node_modules/.bin/openapi-generator-cli'),
    resolve(repoRoot, 'node_modules/.bin/openapi-generator-cli'),
  ];
  const cli = candidates.find((p) => existsSync(p));

  const cliArgs = [
    'generate',
    '-g', target.generator,
    '-i', specPath,
    '-o', target.dir,
    '--additional-properties=' + formatOpts(target.opts),
  ];

  if (!cli) {
    throw new Error(
      `[build-sdks] @openapitools/openapi-generator-cli not found in any of:\n` +
        candidates.map((p) => '  ' + p).join('\n') +
        `\nIt is a devDep of apps/api-public; run \`npm install --prefix apps/api-public\`. ` +
        `Per SS-027b constraints, do NOT add it to the root devDependencies.`,
    );
  }

  // SS-027c: the OpenAPI Generator is a thin Node wrapper around a Java JAR
  // (`org.openapitools.codegen.OpenAPIGenerator`). It shells out to `java`,
  // so we fail fast with a clear message if Java is missing — that path
  // is otherwise surfaced as an opaque "Error: 'java' is not recognized".
  if (!javaOnPath()) {
    throw new Error(
      `[build-sdks] Java is required to run the OpenAPI Generator JAR used by ${target.label}, ` +
        `but \`java\` is not on PATH. Install a JDK (>= 11) and retry. ` +
        `On Windows: winget install Microsoft.OpenJDK.21, or download from ` +
        `https://adoptium.net. On macOS: brew install openjdk@21. ` +
        `On Debian/Ubuntu: apt-get install -y openjdk-21-jdk.`,
    );
  }

  console.log(`[build-sdks] ${target.label}`);
  console.log(`  spec:    ${specPath}`);
  console.log(`  dir:     ${target.dir}`);
  console.log(`  gen:     ${target.generator}`);
  console.log(`  cli:     ${cli}`);

  // Use `npx` on Windows so the .cmd shim runs correctly through the
  // shell (avoids the EINVAL/space-in-path issues from spawning the
  // .cmd file directly via execFileSync). On Linux/macOS, exec the
  // binary directly — no shell quoting needed.
  if (process.platform === 'win32') {
    // Quote the .cmd path to survive spaces in `C:\Users\ASUS TUF A15\...`.
    const quoted = `"${cli}.cmd"`;
    execFileSync(quoted, cliArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: true,
    });
  } else {
    execFileSync(cli, cliArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  }

  console.log(`[build-sdks] ${target.label} generated.`);
}

/**
 * SS-027b — Node-specific build path.
 *
 * The openapi-generator-cli `typescript-fetch` template clobbers the
 * entire target directory, including our hand-rolled `src/index.ts`
 * wrapper that re-exports `Configuration` and exposes `createClient()`.
 * To make regeneration idempotent we:
 *   1. Snapshot the hand-rolled files into memory
 *   2. Run the generic `buildTarget`
 *   3. Restore the hand-rolled files
 */
function buildNode(target, specPath) {
  // Snapshot wrapper files that must survive regeneration.
  const wrapperFiles = ['src/index.ts', 'src/index.test.ts', 'README.md', 'tsconfig.json', 'package.json'];
  const snapshot = {};
  for (const rel of wrapperFiles) {
    const p = join(target.dir, rel);
    if (existsSync(p)) snapshot[rel] = readFileSync(p, 'utf8');
  }

  buildTarget(target, specPath);

  // Restore hand-rolled files (the generator wrote its own package.json,
  // tsconfig.json, README.md, etc — ours take precedence for the public
  // surface of @swiftship/node).
  for (const [rel, content] of Object.entries(snapshot)) {
    const p = join(target.dir, rel);
    writeFileSync(p, content, 'utf8');
    console.log(`[build-sdks] restored hand-rolled ${rel}`);
  }

  console.log(`[build-sdks] ${target.label} generated (SS-027b).`);
}

/**
 * SS-027d — PHP-specific build path.
 *
 * Same idempotency problem as buildNode(): the openapi-generator-cli
 * `php` template clobbers the entire target directory, including
 * the hand-rolled files that make up the publishable surface of
 * `swiftship/sdk-php`:
 *   - composer.json  (the canonical publish artefact, NOT the
 *                     generator's lib/composer.json)
 *   - README.md      (human-facing install + usage)
 *   - phpunit.xml.dist
 *   - .gitignore
 *   - src/Client.php (hand-rolled wrapper around OpenAPI\Client\*)
 *   - tests/SmokeTest.php + tests/TrackingSmokeTest.php
 *
 * Snapshot those files into memory, run the generic buildTarget(),
 * then restore so the generated `lib/` lands alongside the hand-rolled
 * `src/`/`tests/` and the public composer.json stays in control.
 */
function buildPHP(target, specPath) {
  const wrapperFiles = [
    'composer.json',
    'README.md',
    'phpunit.xml.dist',
    '.gitignore',
    'src/Client.php',
    'tests/SmokeTest.php',
    'tests/TrackingSmokeTest.php',
  ];
  const snapshot = {};
  for (const rel of wrapperFiles) {
    const p = join(target.dir, rel);
    if (existsSync(p)) snapshot[rel] = readFileSync(p, 'utf8');
  }

  buildTarget(target, specPath);

  for (const [rel, content] of Object.entries(snapshot)) {
    const p = join(target.dir, rel);
    writeFileSync(p, content, 'utf8');
    console.log(`[build-sdks] restored hand-rolled ${rel}`);
  }

  console.log(`[build-sdks] ${target.label} generated (SS-027d).`);
}

function formatOpts(opts) {
  return Object.entries(opts)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
}

/**
 * Return true iff `java` is on PATH (the OpenAPI Generator JAR needs it).
 * Cheap probe — runs `java -version` and looks for exit code 0.
 */
function javaOnPath() {
  const probe = spawnSync(
    process.platform === 'win32' ? 'java.exe' : 'java',
    ['-version'],
    { stdio: 'ignore' },
  );
  if (probe.status === 0) return true;
  if (probe.error) {
    // ENOENT on Linux/macOS — `java` binary not on PATH.
    return probe.error.code !== 'ENOENT' ? true : false;
  }
  return false;
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
    try {
      // SS-027b (Node) + SS-027d (PHP): both need wrapper-file
      // preservation. Python goes through the generic path.
      if (name === 'node') {
        buildNode(t, args.spec);
      } else if (name === 'php') {
        buildPHP(t, args.spec);
      } else {
        buildTarget(t, args.spec);
      }
    } catch (err) {
      console.error(`[build-sdks] ${name} generation FAILED: ${err.message}`);
      process.exit(1);
    }
  }
  console.log('[build-sdks] All targets generated.');
}

main();
