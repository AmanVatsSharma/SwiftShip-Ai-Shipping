import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import {
  AUDITABLE_METADATA_KEY,
  AuditableOptions,
} from './auditable.decorator';
import { getCorrelationContext } from '../correlation/context';

/**
 * SS-028 — AuditInterceptor.
 *
 * Registers as a global GraphQL interceptor. For every resolver method
 * decorated with `@Auditable({ action, resourceType, resourceIdPath? })`
 * it:
 *
 *  1. resolves the GraphQL context (req, args, info),
 *  2. reads the active `tenantId` + `userId` from the request and ALS,
 *  3. captures the mutation args as `before` (JSONB),
 *  4. calls the resolver,
 *  5. on success, captures the return value's `id` as `resourceId`,
 *     and the return value itself as `after`,
 *  6. records one row in `audit_logs`.
 *
 * On failure: the error is rethrown *and* an audit row is still written
 * with `after=null` and `metadata.error=<message>` so an admin can
 * answer "who tried to do X, and did it succeed?" without needing to
 * read the structured logs.
 *
 * The interceptor never throws — `AuditLogService.record()` already
 * catches and warns on failure.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const opts = this.reflector.getAllAndOverride<AuditableOptions | undefined>(
      AUDITABLE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!opts) {
      // Not decorated — fast path.
      return next.handle();
    }

    const gql = GqlExecutionContext.create(context);
    const info = gql.getInfo();
    const args = gql.getArgs() ?? {};
    const ctx = gql.getContext();
    const req = ctx?.req;

    const correlation = getCorrelationContext();
    const tenantId =
      req?.tenantId ??
      correlation?.tenantId ??
      args?.input?.tenantId ??
      args?.tenantId;
    const actorUserId =
      req?.user?.id ?? req?.userId ?? correlation?.userId ?? null;

    const before = this.snapshot(args);
    const ipAddress = this.pickIp(req);
    const userAgent = req?.headers?.['user-agent'];

    return next.handle().pipe(
      tap((result) => {
        const after = this.snapshot(result);
        const resourceId = this.resolveResourceId(result, opts.resourceIdPath);
        void this.audit.record({
          tenantId,
          actorUserId,
          actorType: req?.user ? 'user' : req?.apiKey ? 'api_key' : 'system',
          action: opts.action,
          resourceType: opts.resourceType,
          resourceId: resourceId ?? null,
          before,
          after,
          ipAddress,
          userAgent,
          correlationId: correlation?.correlationId,
          metadata: { fieldName: info?.fieldName },
        });
      }),
      catchError((err) => {
        void this.audit.record({
          tenantId,
          actorUserId,
          actorType: req?.user ? 'user' : req?.apiKey ? 'api_key' : 'system',
          action: opts.action,
          resourceType: opts.resourceType,
          resourceId: args?.input?.id ?? null,
          before,
          after: null,
          ipAddress,
          userAgent,
          correlationId: correlation?.correlationId,
          metadata: {
            fieldName: info?.fieldName,
            error: err?.message ?? String(err),
          },
        });
        return throwError(() => err);
      }),
    );
  }

  /**
   * Best-effort shallow JSON snapshot. Cycles / non-serializable values
   * are dropped; we never want an audit write to throw because of the
   * shape of the input.
   */
  private snapshot(value: unknown): Record<string, any> | null {
    if (value === undefined || value === null) return null;
    try {
      const seen = new WeakSet();
      return JSON.parse(
        JSON.stringify(value, (_k, v) => {
          if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return undefined;
            seen.add(v);
          }
          if (typeof v === 'function') return undefined;
          if (typeof v === 'bigint') return v.toString();
          return v;
        }),
      );
    } catch {
      return null;
    }
  }

  private resolveResourceId(
    result: any,
    path: string | undefined,
  ): string | number | null {
    if (!result) return null;
    const dotted = path ?? 'id';
    const parts = dotted.split('.');
    let cur: any = result;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) {
        cur = cur[p];
      } else {
        return null;
      }
    }
    if (cur === null || cur === undefined) return null;
    return cur as string | number;
  }

  private pickIp(req: any): string | undefined {
    if (!req) return undefined;
    return (
      req.headers?.['x-forwarded-for']?.split(',')?.[0]?.trim() ??
      req.ip ??
      req.socket?.remoteAddress ??
      undefined
    );
  }
}
