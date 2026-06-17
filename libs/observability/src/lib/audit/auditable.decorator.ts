import { SetMetadata } from '@nestjs/common';

export const AUDITABLE_METADATA_KEY = 'ss-028:auditable';

/**
 * SS-028 — `@Auditable({ action, resourceType, resourceIdPath? })` decorator.
 *
 * Apply to a GraphQL `@Mutation` resolver method to make the
 * `AuditInterceptor` auto-record one `audit_logs` row per call.
 *
 *  - `action`        — the action verb, e.g. `'orders.cancel'`.
 *  - `resourceType`  — the resource name, e.g. `'Order'`.
 *  - `resourceIdPath`— optional dotted path into the *return value*
 *                      that points to the resource id, e.g. `'order.id'`.
 *                      If absent, the interceptor falls back to the
 *                      `id` field at the root of the return value.
 *
 * Example:
 *
 *   @Auditable({ action: 'orders.cancel', resourceType: 'Order' })
 *   @Mutation(() => Order)
 *   async cancelOrder(@Args('input') input: CancelInput) { ... }
 */
export interface AuditableOptions {
  action: string;
  resourceType: string;
  /** Dotted path into the return value. Default 'id'. */
  resourceIdPath?: string;
}

export const Auditable = (options: AuditableOptions) =>
  SetMetadata(AUDITABLE_METADATA_KEY, options);
