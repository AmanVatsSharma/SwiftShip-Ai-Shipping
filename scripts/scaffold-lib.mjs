#!/usr/bin/env node
// Scaffolds a new domain lib at libs/domains/<name>/
// Mirrors the structure of libs/domains/warehouses: package.json, project.json,
// tsconfig.json, tsconfig.lib.json, README.md, and an empty src/lib/.
// Usage: node scripts/scaffold-lib.mjs <name> [tag]
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const name = process.argv[2];
const tag = process.argv[3] || name;
if (!name) {
  console.error('usage: node scripts/scaffold-lib.mjs <name> [scope-tag]');
  process.exit(1);
}
const root = resolve(process.cwd());
const tgt = resolve(root, 'libs/domains', name);
const tmpl = resolve(root, 'libs/domains/warehouses');

async function copy(from, to) {
  const src = resolve(tmpl, from);
  const dst = resolve(tgt, to);
  await mkdir(resolve(dst, '..'), { recursive: true });
  await copyFile(src, dst);
  return dst;
}

const filesToCopy = [
  ['tsconfig.json', 'tsconfig.json'],
  ['tsconfig.lib.json', 'tsconfig.lib.json'],
  ['README.md', 'README.md'],
];

if (existsSync(tgt)) {
  console.error(`[scaffold] lib ${name} already exists at ${tgt}`);
  process.exit(1);
}
await mkdir(`${tgt}/src/lib`, { recursive: true });

// 1. package.json (replace name)
const pkg = JSON.parse(await readFile(resolve(tmpl, 'package.json'), 'utf8'));
pkg.name = `@swiftship/domains-${name}`;
await writeFile(`${tgt}/package.json`, JSON.stringify(pkg, null, 2) + '\n');

// 2. project.json (replace name, sourceRoot, outputPath, scope, tsConfig etc.)
const proj = JSON.parse(await readFile(resolve(tmpl, 'project.json'), 'utf8'));
proj.name = name;
proj.sourceRoot = `libs/domains/${name}/src`;
proj.tags = proj.tags.map((t) =>
  t === 'scope:warehouses' ? `scope:${tag}` : t,
);
proj.targets.build.options.outputPath = `dist/libs/domains/${name}`;
proj.targets.build.options.tsConfig = `libs/domains/${name}/tsconfig.lib.json`;
proj.targets.build.options.packageJson = `libs/domains/${name}/package.json`;
proj.targets.build.options.main = `libs/domains/${name}/src/index.ts`;
proj.targets.build.options.assets = [`libs/domains/${name}/*.md`];
await writeFile(`${tgt}/project.json`, JSON.stringify(proj, null, 2) + '\n');

// 3. tsconfig + tsconfig.lib (replace the path)
for (const f of filesToCopy) {
  let txt = await readFile(resolve(tmpl, f[0]), 'utf8');
  txt = txt.replace(/domains\/warehouses/g, `domains/${name}`);
  await writeFile(resolve(tgt, f[1]), txt);
}

// 4. placeholder src/index.ts
await writeFile(
  `${tgt}/src/index.ts`,
  `// Placeholder barrel for @swiftship/domains-${name}.\n// Implemented in Plan 3. Re-exports get added as the migration lands.\nexport const ${name.toUpperCase().replace(/-/g, '_')}_LIB_VERSION = '0.0.1-pilot';\n`,
);

console.log(`[scaffold] created libs/domains/${name}`);
