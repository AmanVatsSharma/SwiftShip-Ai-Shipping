'use client';

import { formatDateTime } from '@swiftship/shared-ui';
import type { TenantBranding } from '../../../lib/tracking';

interface TrackHeaderProps {
  awb: string;
  tenant: TenantBranding;
  status: string | null;
  carrierId: number | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

function statusLabel(status: string | null): string {
  if (!status) return 'Awaiting first scan';
  return status.replace(/_/g, ' ').toLowerCase();
}

function statusTone(
  status: string | null,
): 'bg-emerald-100 text-emerald-800' | 'bg-amber-100 text-amber-800' | 'bg-slate-100 text-slate-700' {
  if (status === 'DELIVERED') return 'bg-emerald-100 text-emerald-800';
  if (status === 'CANCELLED' || status === 'RTO')
    return 'bg-rose-100 text-rose-800';
  if (status === 'IN_TRANSIT' || status === 'SHIPPED')
    return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

/**
 * Header for the customer tracking page. Shows the tenant logo, AWB,
 * current status, courier, ETA and the tenant's support contact details.
 */
export function TrackHeader({
  awb,
  tenant,
  status,
  carrierId,
  shippedAt,
  deliveredAt,
}: TrackHeaderProps) {
  const eta = deliveredAt ?? shippedAt;

  return (
    <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        {tenant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            className="h-10 w-auto max-w-[120px] rounded object-contain sm:h-12"
          />
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white sm:h-12 sm:w-12"
            style={{ backgroundColor: tenant.brandColor ?? '#4f46e5' }}
            aria-hidden="true"
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {tenant.name}
          </div>
          <div className="mt-0.5 truncate text-base font-semibold text-slate-900 sm:text-lg">
            {awb || '—'}
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(status)}`}
        >
          {statusLabel(status)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:mt-5 sm:gap-6">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Courier
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {carrierId != null ? `Courier #${carrierId}` : 'Auto-assigned'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">ETA</dt>
          <dd className="mt-1 font-medium text-slate-900">
            {eta ? formatDateTime(eta) : 'Calculating…'}
          </dd>
        </div>
      </dl>

      {(tenant.supportPhone || tenant.supportEmail) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-sm">
          {tenant.supportPhone && (
            <a
              href={`tel:${tenant.supportPhone}`}
              className="text-slate-700 hover:text-slate-900"
            >
              <span className="text-slate-500">Support: </span>
              {tenant.supportPhone}
            </a>
          )}
          {tenant.supportEmail && (
            <a
              href={`mailto:${tenant.supportEmail}`}
              className="text-slate-700 hover:text-slate-900"
            >
              {tenant.supportEmail}
            </a>
          )}
        </div>
      )}
    </header>
  );
}
