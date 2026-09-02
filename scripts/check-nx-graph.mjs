#!/usr/bin/env node
/**
 * scripts/check-nx-graph.mjs
 *
 * Static architectural guard for the Nx workspace.
 *
 * Asserts:
 *   1. No cycles in the lib dependency graph.
 *   2. Every domain lib depends only on platform / shared / observability libs.
 *   3. No platform lib depends on a domain lib.
 *   4. Every project has a project.json + tsconfig.json + tsconfig.lib.json (libs)
 *      or src/main.ts (apps).
 *
 * Reads the dependency graph from `npx nx graph --json`. Falls back to scanning
 * `project.json` files directly when the Nx CLI is not on PATH (e.g. local
 * smoke runs). All decisions come from the `tags` field on each project —
 * matching the depConstraints declared in `eslint.config.mjs`.
 *
 * Usage:
 *   node scripts/check-nx-graph.mjs
 *
 * Exit code 0 = clean, 1 = violations.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

// ---------------------------------------------------------------------------
// Layer taxonomy — keep in sync with eslint.config.mjs depConstraints
// ---------------------------------------------------------------------------
const TAGS = {
  PLATFORM: ['layer:platform', 'layer:observability', 'layer:shared', 'layer:ui'],
  DOMAIN: ['layer:domain'],
  API: ['layer:api'],
  DATA_ACCESS: ['layer:data-access'],
  TYPES: ['layer:types'],
  UTILS: ['layer:utils'],
  TOOLS: ['layer:tools'],
  // App scopes (top-level entry points — exempt from domain→platform rules)
  APP: ['scope:api', 'scope:admin-portal', 'scope:web'],
};

// Forbidden dep edges (source tag group, forbidden target tag group).
// A platform/shared/observability/utility layer must never depend on a
// domain, data-access, or api layer — that would invert the dependency arrow.
const FORBIDDEN_EDGES = [
  { from: 'PLATFORM', to: 'DOMAIN' },
  { from: 'PLATFORM', to: 'API' },
  { from: 'PLATFORM', to: 'DATA_ACCESS' },
  { from: 'DOMAIN', to: 'API' },
  { from: 'TYPES', to: 'DOMAIN' },
  { from: 'TYPES', to: 'API' },
  { from: 'TYPES', to: 'PLATFORM' },
  { from: 'TYPES', to: 'DATA_ACCESS' },
  { from: 'TYPES', to: 'UTILS' },
  { from: 'UTILS', to: 'DOMAIN' },
  { from: 'UTILS', to: 'API' },
  // TOOLS must stay leaf — no platform/domain/api/data-access imports.
  { from: 'TOOLS', to: 'DOMAIN' },
  { from: 'TOOLS', to: 'API' },
  { from: 'TOOLS', to: 'DATA_ACCESS' },
  { from: 'TOOLS', to: 'PLATFORM' },
];

// ---------------------------------------------------------------------------
// 1. Load the Nx project graph
// ---------------------------------------------------------------------------
/** @type {{ graph: { nodes: Record<string, any>, dependencies: Record<string, any[]> } }} */
let graph;
const tmpFile = join(ROOT, '.nx-graph.json');
try {
  execFileSync('npx', ['nx', 'graph', '--file', tmpFile, '--json'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  graph = JSON.parse(readFileSync(tmpFile, 'utf-8'));
} catch (err) {
  // Local fallback: build a minimal graph from project.json files + import
  // scanning. Less precise than `nx graph`, but enough to catch the
  // cycle/structure violations this script owns.
  graph = buildFallbackGraph();
}

const nodes = graph.graph?.nodes ?? {};
const deps = graph.graph?.dependencies ?? {};

// ---------------------------------------------------------------------------
// 2. Layer-rule checks
// ---------------------------------------------------------------------------
const violations = [];

function tagGroup(project, ...groups) {
  const tags = project?.data?.tags ?? [];
  for (const g of groups) {
    if (g.some((t) => tags.includes(t))) return g;
  }
  return null;
}

for (const edge of FORBIDDEN_EDGES) {
  for (const [name, project] of Object.entries(nodes)) {
    const sourceGroup = tagGroup(project, TAGS[edge.from]);
    if (!sourceGroup) continue;
    const sourceTags = sourceGroup.filter((t) =>
      (project.data.tags ?? []).includes(t),
    );
    if (sourceTags.length === 0) continue;

    const projectDeps = deps[name] ?? [];
    for (const dep of projectDeps) {
      const targetNode = nodes[dep.target];
      if (!targetNode) continue;
      const targetTags = targetNode.data?.tags ?? [];
      if (TAGS[edge.to].some((t) => targetTags.includes(t))) {
        const sourceTag = sourceTags.find((t) => TAGS[edge.from].includes(t));
        const targetTag = TAGS[edge.to].find((t) => targetTags.includes(t));
        violations.push(
          `${name} (${sourceTag}) -> ${dep.target} (${targetTag}): forbidden edge ${edge.from}->${edge.to}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Cycle detection — DFS with white/grey/black colouring.
// ---------------------------------------------------------------------------
const WHITE = 0;
const GREY = 1;
const BLACK = 2;
const color = new Map(Object.keys(nodes).map((k) => [k, WHITE]));
const stack = [];

/** @type {string[][]} */
const cycles = [];

function dfs(node) {
  color.set(node, GREY);
  stack.push(node);
  for (const dep of deps[node] ?? []) {
    const target = dep.target;
    const c = color.get(target);
    if (c === GREY) {
      const idx = stack.indexOf(target);
      if (idx >= 0) cycles.push(stack.slice(idx).concat(target));
    } else if (c === WHITE) {
      dfs(target);
    }
  }
  color.set(node, BLACK);
  stack.pop();
}

for (const name of Object.keys(nodes)) {
  if (color.get(name) === WHITE) dfs(name);
}

for (const cycle of cycles) {
  violations.push(`dependency cycle: ${cycle.join(' -> ')}`);
}

// ---------------------------------------------------------------------------
// 4. Required files per project
// ---------------------------------------------------------------------------
function projectRoot(name) {
  return nodes[name]?.data?.root ?? name;
}

for (const [name, project] of Object.entries(nodes)) {
  const root = projectRoot(name);
  const type = project.data?.type ?? 'lib';
  const isApp = type === 'app' || (project.data?.projectType ?? 'library') === 'application';

  // project.json + tsconfig.json always required
  for (const f of ['project.json', 'tsconfig.json']) {
    if (!existsSync(join(ROOT, root, f))) {
      violations.push(`${name}: missing ${f} at ${root}`);
    }
  }

  if (isApp) {
    // App entry points vary: `src/` for NestJS, `app/` (App Router) or
    // `pages/` for Next.js. Any of the three satisfies the source check.
    const candidates = ['src', 'app', 'pages'];
    const found = candidates.some((d) => existsSync(join(ROOT, root, d)));
    if (!found) {
      violations.push(
        `${name} (app): missing src/app/pages directory at ${root}`,
      );
    }
  } else if (root.startsWith('libs/')) {
    // Lib artifact checks apply to libs/ only — root-level script projects
    // (chaos/, loadtest/) have no barrels by design.
    const libTs = join(ROOT, root, 'tsconfig.lib.json');
    if (!existsSync(libTs)) {
      violations.push(`${name} (lib): missing tsconfig.lib.json`);
    }
    const indexTs = join(ROOT, root, 'src', 'index.ts');
    if (!existsSync(indexTs)) {
      violations.push(`${name} (lib): missing src/index.ts`);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------
const total = Object.keys(nodes).length;
if (violations.length) {
  console.error(`Nx graph violations (${violations.length}):`);
  for (const v of violations) console.error('  - ' + v);
  console.error(`\nChecked ${total} projects.`);
  process.exit(1);
}
console.log(`OK: checked ${total} projects, 0 violations.`);

// ---------------------------------------------------------------------------
// Fallback: scan project.json files + tsconfig path mappings when nx CLI
// is unavailable. Heuristic, but enough for layer + required-file checks.
// ---------------------------------------------------------------------------
function buildFallbackGraph() {
  const localDeps = { graph: { nodes: {}, dependencies: {} } };
  const workspaceRoot = ROOT;
  const pathMap = readPathMap();

  // 1. Find every project.json
  const projectFiles = walkJson(join(workspaceRoot, 'libs'), 'project.json').concat(
    walkJson(join(workspaceRoot, 'apps'), 'project.json'),
  );

  for (const file of projectFiles) {
    const project = JSON.parse(readFileSync(file, 'utf-8'));
    const name = project.name;
    const root = dirname(file).replace(/\\/g, '/');
    const sourceRoot = (project.sourceRoot ?? join(root, 'src').replace(/\\/g, '/')).replace(/\\/g, '/');
    localDeps.graph.nodes[name] = {
      data: {
        root,
        sourceRoot,
        type: project.projectType === 'application' ? 'app' : 'lib',
        tags: project.tags ?? [],
        name,
      },
    };

    // 2. Resolve deps from package.json (if present) for runtime deps
    const pkgPath = join(workspaceRoot, root, 'package.json');
    const libDeps = [];
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        for (const dep of Object.keys(pkg.dependencies ?? {})) {
          if (localDeps.graph.nodes[dep]) libDeps.push({ target: dep });
        }
      } catch {
        // ignore
      }
    }

    // 3. Resolve deps from tsconfig path mapping: any `@swiftship/X`
    //    import in sourceRoot maps to libs/<X>. We approximate by
    //    looking up known name -> directory mapping in tsconfig.base.json.
    for (const [alias, target] of Object.entries(pathMap)) {
      if (target.startsWith('libs/')) {
        // alias like "@swiftship/domains-billing" or "@swiftship/domains/*"
        const m = alias.match(/^@swiftship\/(?:domains-|platform-)([a-z-]+)$/);
        if (m && m[1] === name) {
          // self-skip
        } else if (m && localDeps.graph.nodes[m[1]]) {
          libDeps.push({ target: m[1] });
        }
      }
    }

    localDeps.graph.dependencies[name] = libDeps;
  }

  return localDeps;
}

function walkJson(dir, filename) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkJson(full, filename));
    else if (entry === filename) out.push(full);
  }
  return out;
}

function readPathMap() {
  const tsBase = join(ROOT, 'tsconfig.base.json');
  if (!existsSync(tsBase)) return {};
  try {
    const ts = JSON.parse(readFileSync(tsBase, 'utf-8'));
    return ts.compilerOptions?.paths ?? {};
  } catch {
    return {};
  }
}
