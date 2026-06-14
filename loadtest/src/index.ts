// Barrel for the loadtest Nx project.
//
// The k6 scenarios themselves are imported by the k6 binary at runtime,
// not by Node — so this barrel exists purely to satisfy the Nx graph
// guard (scripts/check-nx-graph.mjs) and the eslint depConstraints
// resolver. The actual entrypoints are:
//   - loadtest/k6/lib/seed.js          (Node 20+ seeder)
//   - loadtest/k6/scenarios/*.js       (k6 binary)
export const LOADTEST_PROJECT = 'loadtest';
