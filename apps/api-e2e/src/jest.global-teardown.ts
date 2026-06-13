/**
 * E2E global teardown — bring down the local DB containers we started in
 * global-setup. Idempotent: if we never started them, this is a no-op.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export default async function () {
  if (process.env.CI) return;
  if (process.env.SKIP_LOCAL_DB) return;
  try {
    await execFileP('docker', ['compose', 'down'], { cwd: process.cwd() });
  } catch {
    /* ignore */
  }
}
