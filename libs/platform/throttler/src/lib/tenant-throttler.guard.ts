import {
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerRequest,
  ThrottlerStorage,
} from '@nestjs/throttler';

// Local structural types — platform libs must not import from domains/
// (layering rule enforced by scripts/check-nx-graph.mjs). The request
// carries the real TenantContext; we only touch its two accessors.
type TenantTier = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
interface TenantContextLike {
  getTenantId?(): number | undefined;
  getTier?(): TenantTier | undefined;
}

/**
 * Per-tenant rate limits. Bucket sizes are picked from `tenantTier`:
 *
 *   STARTER     =   60 req / 60_000 ms
 *   GROWTH      =  300 req / 60_000 ms
 *   PRO         = 1000 req / 60_000 ms
 *   ENTERPRISE  =10000 req / 60_000 ms
 *
 * The tracker is `tenant:<tenantId>`. If no tenant can be resolved (no
 * `tenantId` on the request, no `user.id` from the JWT), we fall back to
 * `tenant:anonymous` so unauthenticated traffic is still bucketed and can't
 * piggyback on a real tenant's quota.
 *
 * The guard is APP_GUARD-scoped (singleton), so it reads tenant identity
 * from `req.tenantId` (set on the request by `TenantMiddleware`) and, if
 * an explicit `TenantContext` is injected via `app.use(...)` or a custom
 * decorator, the per-tier tier hint can also be set on `req.tenantTier`.
 *
 * SS-003b is responsible for wiring this guard into
 * `apps/api/src/app.module.ts` and replacing the global `ThrottlerGuard`.
 */
const TIER_BUCKETS: Record<
  TenantTier,
  { limit: number; ttl: number }
> = {
  STARTER: { limit: 60, ttl: 60_000 },
  GROWTH: { limit: 300, ttl: 60_000 },
  PRO: { limit: 1000, ttl: 60_000 },
  ENTERPRISE: { limit: 10_000, ttl: 60_000 },
};

const DEFAULT_TIER: TenantTier = 'STARTER';

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(TenantThrottlerGuard.name);

  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * GraphQL requests: the stock ThrottlerGuard unwraps the GQL context as
   * `res`, which is `{ req }` here (not an Express response) — its quota
   * header code then crashes with "res.header is not a function" (found by
   * the first live boot, 2026-08). Unwrap the Apollo context and recover
   * the real Express objects (`req.res` is Express's back-reference).
   */
  protected getRequestResponse(context: ExecutionContext): { req: Record<string, any>; res: Record<string, any> } {
    if (context.getType<any>() === 'graphql') {
      const gqlCtx = context.getArgByIndex(2) as
        | { req?: any; res?: any }
        | undefined;
      if (gqlCtx?.req) {
        const req = gqlCtx.req;
        const res = gqlCtx.res ?? req.res;
        if (res && typeof res.header === 'function') {
          return { req, res };
        }
        // No usable Express res (pure-GraphQL context) — hand the base
        // guard a res-shaped stub so quota headers become no-ops instead
        // of crashing the resolver.
        return {
          req,
          res: {
            header: () => undefined,
            setHeader: () => undefined,
            getHeader: () => undefined,
          },
        };
      }
    }
    return super.getRequestResponse(context);
  }

  /**
   * Resolve the bucket key for the current request. Reads from:
   *
   *   1. `req.tenantId` (set by `TenantMiddleware` from the API key or JWT)
   *   2. `req.user.tenantId` (set by `JwtStrategy` from the JWT payload)
   *   3. `req.user.userId` (last-resort auth identity)
   *   4. Falls back to `tenant:anonymous` so unauthenticated traffic can't
   *      piggyback on a real tenant's quota.
   *
   * If a `TenantContext` instance is reachable via `req.tenantContext`
   * (decorator-injected in resolvers), we prefer its `getTenantId()` over
   * the request property so that the request-scoped context remains the
   * single source of truth.
   */
  protected async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    const tenantContext = req?.tenantContext as TenantContextLike | undefined;
    const contextTenantId = tenantContext?.getTenantId?.();
    const tenantId: number | string | undefined =
      contextTenantId ??
      req?.tenantId ??
      req?.user?.tenantId ??
      req?.user?.userId;

    if (tenantId === undefined || tenantId === null) {
      return 'tenant:anonymous';
    }
    return `tenant:${tenantId}`;
  }

  /**
   * Pick the tier for the current request, preferring the request-scoped
   * `TenantContext` (which `TenantMiddleware` populates) over the request
   * property bag. If neither is set, default to STARTER so the bucket is
   * always defined.
   */
  private resolveTenantTier(req: Record<string, any>): TenantTier {
    const tenantContext = req?.tenantContext as TenantContextLike | undefined;
    const contextTier = tenantContext?.getTier?.();
    if (contextTier) {
      return contextTier;
    }

    const explicit: unknown =
      req?.tenantTier ?? req?.user?.tenantTier ?? req?.headers?.['x-tenant-tier'];

    if (
      explicit === 'STARTER' ||
      explicit === 'GROWTH' ||
      explicit === 'PRO' ||
      explicit === 'ENTERPRISE'
    ) {
      return explicit;
    }

    return DEFAULT_TIER;
  }

  /**
   * Override the throttler selection to pick the tenant-tier bucket.
   *
   * We do this by:
   *   1. Looking up `tenantTier` from the request (set elsewhere, e.g. by
   *      an auth interceptor that decorates `req.tenantTier`). For now we
   *      accept either an explicit claim or default to STARTER.
   *   2. Calling `super.handleRequest()` with a synthesized `ThrottlerOptions`
   *      whose `limit` and `ttl` are the tier-specific values.
   */
  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const ctx = requestProps.context;
    const { req, res } = this.getRequestResponse(ctx);

    const tier = this.resolveTenantTier(req);
    const bucket = TIER_BUCKETS[tier] ?? TIER_BUCKETS[DEFAULT_TIER];

    const tierThrottler = {
      ...requestProps.throttler,
      name: requestProps.throttler.name ?? 'tenant',
      limit: bucket.limit,
      ttl: bucket.ttl,
    };

    const ok = await super.handleRequest({
      ...requestProps,
      limit: bucket.limit,
      ttl: bucket.ttl,
      throttler: tierThrottler,
    });

    if (ok && res) {
      this.setRateLimitHeaders(res, bucket.limit, requestProps);
    }

    return ok;
  }

  /**
   * Set the standard rate-limit response headers on success. The base
   * `ThrottlerGuard` does not always populate these for HTTP responses
   * when subclasses override `handleRequest`, so we do it explicitly.
   *
   * Without the underlying hit count we report `limit - 1` (the just-served
   * request) as remaining. The 429 path (`throwThrottlingException` below)
   * has the real total and reports the precise remaining.
   */
  private setRateLimitHeaders(
    res: Record<string, any>,
    limit: number,
    requestProps: ThrottlerRequest,
  ): void {
    if (typeof res.setHeader !== 'function') return;
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - 1)));
    res.setHeader(
      'X-RateLimit-Reset',
      String(Math.ceil((Date.now() + requestProps.ttl) / 1000)),
    );
  }

  /**
   * Override `throwThrottlingException` so we can attach the rate-limit
   * headers on 429 responses as well. We log the rejection with the
   * resolved tracker for visibility.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);

    if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-RateLimit-Limit', String(detail.limit));
      res.setHeader(
        'X-RateLimit-Remaining',
        String(Math.max(0, detail.limit - detail.totalHits)),
      );
      res.setHeader(
        'X-RateLimit-Reset',
        String(Math.ceil((Date.now() + detail.ttl) / 1000)),
      );
    }

    this.logger.warn(
      `Throttled ${detail.tracker} (${detail.totalHits}/${detail.limit})`,
    );
    await super.throwThrottlingException(context, detail);
  }
}
