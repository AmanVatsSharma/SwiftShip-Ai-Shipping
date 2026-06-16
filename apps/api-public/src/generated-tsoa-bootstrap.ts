/**
 * SS-027 — tsoa-generated Express router bootstrap.
 *
 * tsoa emits `RegisterRoutes(app: express.Express): void` at
 * `apps/api-public/src/generated/routes.ts` (regenerated on every
 * `nx build api-public`). The generated function mounts each
 * controller's routes on the *express* app you hand it. We need to
 * preserve the middleware ordering in `main.ts` (tenant-key →
 * tenant-context-bind → tenant-throttler → routes → swagger UI),
 * so we feed the Nest-managed Express app directly to tsoa.
 *
 * NOTE: this file is hand-written, NOT generated. It exists as a
 * thin shim so `main.ts` can import the symbol without caring that
 * tsoa generates the actual implementation.
 */
import type { Express, RequestHandler } from 'express';

let _registerRoutes: ((app: Express) => void) | undefined;

/**
 * Lazy-load the tsoa-generated `RegisterRoutes` function. We do this
 * lazily (not at module top-level) so the import graph doesn't try
 * to resolve `generated/routes.ts` at compile time of the static
 * code — tsoa only emits that file on the first build.
 */
async function loadRegisterRoutes(): Promise<(app: Express) => void> {
  if (_registerRoutes) return _registerRoutes;
  // Dynamic require so the tsoa-generated file is optional at
  // compile-time. The build script runs `tsoa routes` before the
  // TypeScript compile, so the file exists by the time this runs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./generated/routes');
  _registerRoutes = (mod.RegisterRoutes ?? mod.default?.RegisterRoutes) as (
    app: Express,
  ) => void;
  if (typeof _registerRoutes !== 'function') {
    throw new Error(
      'tsoa-generated RegisterRoutes is not a function. Did you run `tsoa routes`?',
    );
  }
  return _registerRoutes;
}

/**
 * Synchronous variant for `main.ts` — tsoa registers routes in a
 * single synchronous call so this is safe.
 *
 * If the generated file is missing (first build before `tsoa routes`
 * has run), we mount a 503 on every /v1/* route so the app still
 * boots and Swagger UI is still reachable. This makes the first
 * dev experience "build & run tsoa, then start the app" without
 * producing a cryptic import error.
 */
export function registerGeneratedRoutes(app: Express): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./generated/routes');
    const fn = (mod.RegisterRoutes ?? mod.default?.RegisterRoutes) as
      | ((a: Express) => void)
      | undefined;
    if (typeof fn === 'function') {
      fn(app);
      return;
    }
  } catch (err) {
    // fall through to placeholder
    // eslint-disable-next-line no-console
    console.warn(
      '[tsoa] generated/routes.ts not found — run `tsoa routes` first. Mounting 503 placeholder.',
      (err as Error).message,
    );
  }

  const placeholder: RequestHandler = (_req, res) => {
    res.status(503).json({
      error: 'ServiceUnavailable',
      message:
        'tsoa routes not generated yet. Run `nx run api-public:tsoa` or `npx tsoa -c apps/api-public/tsoa.json`.',
    });
  };
  app.use('/v1', placeholder);
}

// Keep the async helper exported for future use (e.g. an `onModuleInit`
// hook that awaits it); not used by `main.ts` right now.
export { loadRegisterRoutes };
