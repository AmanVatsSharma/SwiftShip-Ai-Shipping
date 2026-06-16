/**
 * SS-027a — pure response-shaping helpers, no tsoa imports.
 *
 * Extracted from the controller files because importing the controllers
 * pulls in tsoa's runtime, which transitively requires `@tsoa/cli` →
 * `merge-anything` (a peer we don't ship with this app). The controllers
 * re-import these helpers; unit specs can import this file in isolation
 * to test the shaping logic without touching the decorator chain.
 */
import { CarrierResponse } from './carrier.model';
import { ShippingRateResponse } from './shipping-rates.model';
import { ReturnResponse } from './returns.model';

type ReturnStatus = ReturnResponse['status'];

export function toCarrierResponse(c: any): CarrierResponse {
  return {
    id: c.id,
    name: c.name,
    apiKey: c.apiKey,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function toRateResponse(r: any): ShippingRateResponse {
  return {
    id: r.id,
    carrierId: r.carrierId,
    serviceName: r.serviceName,
    rate: Number(r.rate),
    estimatedDeliveryDays: r.estimatedDeliveryDays,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toReturnResponseBase(r: any): ReturnResponse {
  return {
    id: r.id,
    returnNumber: r.returnNumber,
    status: r.status as ReturnStatus,
    reason: r.reason,
    pickupScheduledAt: r.pickupScheduledAt ?? undefined,
    orderId: r.orderId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface ShapedReturnResponse extends ReturnResponse {
  auditedAt: string;
}

export function shapeReturnResponse(
  r: { id: number; status: string } & Record<string, unknown>,
  auditedAt: Date,
): ShapedReturnResponse {
  const base = toReturnResponseBase(r);
  return {
    ...base,
    status: (r.status as string).toUpperCase() as ReturnStatus,
    auditedAt: auditedAt.toISOString(),
  };
}

export { toReturnResponseBase as toReturnResponse };
