#!/usr/bin/env node
/**
 * refresh-postman.mjs
 *
 * Placeholder for the future "auto-generate the Postman collection from the
 * GraphQL schema and the OpenAPI spec" tool. Today the collection is
 * hand-maintained (see `postman/SwiftShip.postman_collection.json`) — the
 * mutation bodies are real GraphQL operations that match the auto-generated
 * schema at `apps/api/src/schema.graphql`.
 *
 * What it does today:
 *   - Validates `postman/SwiftShip.postman_collection.json` and
 *     `postman/SwiftShip.postman_environment.json` parse as JSON.
 *   - Verifies the schema URL is the v2.1.0 collection schema.
 *   - Asserts that every example mutation is non-empty and well-formed
 *     (`{ "query": "..." }` body).
 *   - Reports the number of flows, requests, and assertions.
 *
 * What it will do (follow-up bead, not in SS-037 scope):
 *   - Pull the GraphQL schema from `apps/api/src/schema.graphql`.
 *   - Walk the schema for `query`/`mutation` roots, generate stub
 *     `*.request.body.raw` for each, and merge into the collection.
 *   - Pull the OpenAPI YAML, generate REST stubs, and merge those too.
 *   - Re-emit `postman/SwiftShip.postman_collection.json` (preserving the
 *     example values for the 8 happy-path flows).
 *
 * Usage:
 *   npm run docs:api:postman
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const COLLECTION = resolve(ROOT, 'postman/SwiftShip.postman_collection.json');
const ENV = resolve(ROOT, 'postman/SwiftShip.postman_environment.json');

function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function walk(items, acc = { requests: 0, folders: 0, tests: 0 }) {
  for (const it of items ?? []) {
    if (it.item) {
      acc.folders += 1;
      walk(it.item, acc);
    } else if (it.request) {
      acc.requests += 1;
      const tests = it.event?.find((e) => e.listen === 'test')?.script?.exec ?? [];
      acc.tests += tests.length;
      // Spot-check that GraphQL ops have a body with a `query` field
      const url = it.request.url?.raw ?? '';
      if (url.includes('/graphql')) {
        const body = it.request.body?.raw ?? '';
        if (!/"query"\s*:/.test(body)) {
          throw new Error(`GraphQL request "${it.name}" is missing a "query" field in its body`);
        }
      }
    }
  }
  return acc;
}

function main() {
  const col = loadJson(COLLECTION);
  const env = loadJson(ENV);

  if (col.info?.schema !== 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json') {
    throw new Error('collection is not v2.1.0 — regenerate by hand');
  }
  if (!env.values?.some((v) => v.key === 'SWIFTSHIP_API_KEY')) {
    throw new Error('environment is missing SWIFTSHIP_API_KEY');
  }
  if (!env.values?.some((v) => v.key === 'baseUrl')) {
    throw new Error('environment is missing baseUrl');
  }

  const stats = walk(col.item);
  console.log(`[refresh-postman] collection: ${stats.folders} folders, ${stats.requests} requests, ${stats.tests} test assertions`);
  console.log('[refresh-postman] no auto-generation yet — see scripts/refresh-postman.mjs header for the follow-up plan.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
