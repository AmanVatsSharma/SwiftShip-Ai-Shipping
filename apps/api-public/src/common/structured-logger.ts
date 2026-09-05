/**
 * SS-027 — re-export the platform `StructuredLogger` so `main.ts` can
 * use it without having to know the path to the lib. This keeps
 * the new app's `main.ts` independent of the observability lib's
 * internal layout.
 */
import { StructuredLogger } from '../../../../libs/observability/src/lib/logger.service';

export function structuredLogger(): StructuredLogger {
  return new StructuredLogger();
}
