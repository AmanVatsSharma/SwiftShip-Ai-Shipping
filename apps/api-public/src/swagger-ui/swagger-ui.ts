/**
 * SS-027 — mount Swagger UI on the underlying express app.
 *
 * Reads the OpenAPI 3.0 spec tsoa emitted at
 * `apps/api-public/src/generated/openapi.json` (re-generated on every
 * `nx build api-public`) and serves Swagger UI at `/docs`. The spec
 * is also served verbatim at `/v1/openapi.json` by `main.ts` so
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
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  // The /v1/openapi.json endpoint is mounted in main.ts so the SDK
  // smoke tests have a stable URL.
}
