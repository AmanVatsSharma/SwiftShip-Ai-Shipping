/**
 * E2E global setup — bring up a transient Postgres + Redis if not already
 * running. The CI workflow in `.github/workflows/ci.yml` provides them as
 * service containers, so this is mostly for local dev. Uses execFile (no
 * shell) to avoid command-injection footguns.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export default async function () {
  // Env defaults FIRST — suites that import AppModule at module scope
  // (health.e2e-spec.ts) trigger Joi validation at import time, before
  // any per-suite setup runs. CI overrides these via job env.
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret';
  process.env.STORAGE_DRIVER = 'stub';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_TEST ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/swiftship_test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

  if (process.env.CI) return; // CI has service containers
  if (process.env.SKIP_LOCAL_DB) return;
  try {
    await execFileP('docker', ['compose', 'up', '-d', 'postgres', 'redis'], {
      cwd: process.cwd(),
    });
  } catch {
    // Best-effort; if Docker isn't available the test will fail with a
    // clear "ECONNREFUSED" which is the actionable error.
  }
}
