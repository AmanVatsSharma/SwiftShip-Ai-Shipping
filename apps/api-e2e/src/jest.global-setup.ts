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
