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

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
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
      // composer.json). DO NOT set `invokerPackage` here:
      //
      //   1. The generator CLI's --additional-properties parser strips
      //      raw backslashes (CI run 33597537086: `Swiftship\\Sdk` came
      //      out as namespace `SwiftshipSdk`), which silently breaks
      //      the composer autoload mapping.
      //   2. The hand-rolled composer.json maps `OpenAPI\Client\` (the
      //      generator's DEFAULT invokerPackage) onto `lib/`, and
      //      src/Client.php + tests/* import `OpenAPI\Client\*`. Keeping
      //      the default keeps generated namespace, composer psr-4 and
      //      the hand wrapper coherent with ONE namespace per directory.
      composerPackageName: 'swiftship/sdk-php',
      packageName: 'swiftship-sdk',
      packageVersion: '0.1.0',
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

  // Pass the spec + output dir as repo-relative paths. The generator
  // CLI re-serialises its argv when it spawns `java`, and absolute
  // Windows repo paths here contain spaces (`C:\Users\ASUS TUF
  // A15\...`) that get split into stray parameters. Relative paths
  // dodge that entirely on every platform (cwd is repoRoot).
  const specArg = relative(repoRoot, specPath);
  const dirArg = relative(repoRoot, target.dir);

  const cliArgs = [
    'generate',
    '-g', target.generator,
    '-i', specArg,
    '-o', dirArg,
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

  // Windows: never go through a shell. cmd.exe's `/s /c` heuristics
  // strip quotes from a pre-quoted command line, which splits every
  // argument containing a space (repo path: `C:\Users\ASUS TUF
  // A15\...`). Instead, invoke the CLI's Node entrypoint directly
  // with the current Node binary — argv is passed through CreateProcess
  // untouched. Fall back to a fully-quoted cmd.exe invocation if the
  // package layout ever changes. On Linux/macOS, exec the .bin shim
  // directly.
  if (process.platform === 'win32') {
    const modulePath = resolve(
      cli,
      '../../@openapitools/openapi-generator-cli/main.js',
    );
    if (existsSync(modulePath)) {
      execFileSync(process.execPath, [modulePath, ...cliArgs], {
        cwd: repoRoot,
        stdio: 'inherit',
      });
    } else {
      const cmdline = [`${cli}.cmd`, ...cliArgs]
        .map((a) => `"${a}"`)
        .join(' ');
      execFileSync(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', cmdline],
        { cwd: repoRoot, stdio: 'inherit' },
      );
    }
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

/**
 * Recursively snapshot every file under `dir` into a map of
 * `<path relative to root>` -> contents, so a whole directory (e.g.
 * `tests/`) can be restored verbatim after generation clobbers it.
 */
function snapshotDir(root, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      snapshotDir(root, p, out);
    } else {
      out[relative(root, p).split('\\').join('/')] = readFileSync(p, 'utf8');
    }
  }
  return out;
}

/**
 * SS-027c/e — Python-specific build path.
 *
 * Same idempotency problem as buildNode()/buildPHP(): the generic
 * `python` generator template rewrites the ENTIRE target directory,
 * including files that make up the hand-rolled publish surface:
 *   - pyproject.toml (ours carries the PEP 621 metadata, the `test`
 *     extra that CI's `pip install -e '.[test]'` relies on, and the
 *     `[tool.pytest.ini_options]` testpaths=["tests"] config; the
 *     generated one is a Poetry-style file with NO `test` extra —
 *     CI run 33597537086 failed with "pytest: command not found"
 *     because of exactly this clobber)
 *   - README.md
 *   - tests/ (hand-rolled pytest smoke tests)
 *
 * The generator ALSO drops a pile of files we deliberately do NOT
 * ship (its own setup.py/setup.cfg/tox.ini, its own `test/` pytest
 * tree, CI configs like .travis.yml/.github/.gitlab-ci.yml,
 * requirements files, git_push.sh, ...). Those are removed after
 * generation so the package tree matches the committed snapshot:
 * `swiftship/` (generated), `pyproject.toml`, `README.md`, `tests/`.
 */
function buildPython(target, specPath) {
  const wrapperFiles = ['pyproject.toml', 'README.md'];
  const snapshot = {};
  for (const rel of wrapperFiles) {
    const p = join(target.dir, rel);
    if (existsSync(p)) snapshot[rel] = readFileSync(p, 'utf8');
  }

  const testsDir = join(target.dir, 'tests');
  const testsSnapshot = existsSync(testsDir)
    ? snapshotDir(testsDir, testsDir, {})
    : {};

  buildTarget(target, specPath);

  for (const rel of wrapperFiles) {
    if (!snapshot[rel]) continue;
    writeFileSync(join(target.dir, rel), snapshot[rel], 'utf8');
    console.log(`[build-sdks] restored hand-rolled ${rel}`);
  }
  for (const [rel, content] of Object.entries(testsSnapshot)) {
    const p = join(testsDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, 'utf8');
  }
  if (Object.keys(testsSnapshot).length) {
    console.log('[build-sdks] restored hand-rolled tests/');
  }

  // Generated files that are NOT part of the publish surface. They
  // would otherwise sit in the tree (and on CI) as dead weight, and
  // setup.py/setup.cfg could even fight the hand-rolled pyproject.toml
  // during `pip install -e`.
  const generatedCruft = [
    '.github',
    '.gitignore',
    '.gitlab-ci.yml',
    '.openapi-generator',
    '.openapi-generator-ignore',
    '.travis.yml',
    'docs',
    'git_push.sh',
    'requirements.txt',
    'setup.cfg',
    'setup.py',
    'test',
    'test-requirements.txt',
    'tox.ini',
  ];
  for (const rel of generatedCruft) {
    const p = join(target.dir, rel);
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      console.log(`[build-sdks] removed generated ${rel}`);
    }
  }

  console.log(`[build-sdks] ${target.label} generated.`);
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
      // SS-027b (Node) + SS-027d (PHP) + the Python path: all three
      // need wrapper-file preservation, each with its own flavor of
      // post-generation cleanup.
      if (name === 'node') {
        buildNode(t, args.spec);
      } else if (name === 'php') {
        buildPHP(t, args.spec);
      } else if (name === 'python') {
        buildPython(t, args.spec);
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
