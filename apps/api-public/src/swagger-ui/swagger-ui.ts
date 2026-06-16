/**
 * SS-027 / SS-027e — mount Swagger UI on the underlying express app.
 *
 * Reads the OpenAPI 3.0 spec tsoa emitted at
 * `apps/api-public/src/generated/openapi.json` (re-generated on every
 * `nx build api-public`) and serves Swagger UI at `/docs/v1/`. The spec
 * is also served verbatim at `/docs/v1/openapi.json` by `main.ts` so
 * `scripts/build-sdks.mjs` and the SDK smoke tests have a stable
 * URL to point at.
 *
 * We use `swagger-ui-express` (dev-dep, no NestJS dependency) to
 * avoid pulling `@nestjs/swagger` — the bead specifies tsoa
 * exclusively.
 */
import type { Express } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const swaggerUi = require('swagger-ui-express') as {
  serve: any;
  setup: (spec: unknown, opts?: unknown) => any;
};

export function mountSwaggerUi(
  app: Express,
  openapiSpec: Record<string, unknown>,
): void {
  // SS-027e — versioned docs route. Mounting on `/docs/v1/` (with
  // trailing slash) means we can ship `/docs/v2/` later without
  // breaking old links. The two-step mount (`/docs/v1/` then
  // `/docs/v1`) lets curl-based smoke tests hit either form.
  app.use('/docs/v1/', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  app.use('/docs/v1', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  // The /docs/v1/openapi.json endpoint is mounted in main.ts so the
  // SDK smoke tests have a stable URL.
}
