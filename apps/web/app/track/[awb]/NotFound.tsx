'use client';

import Link from 'next/link';
import { PackageSearch } from 'lucide-react';

interface NotFoundProps {
  awb: string;
}

/**
 * Empty state rendered when the AWB has no tracking events (or doesn't
 * resolve to a shipment). Mobile-friendly: stacked, large touch target.
 */
export function NotFound({ awb }: NotFoundProps) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center sm:py-14">
      <PackageSearch
        className="h-10 w-10 text-slate-400 sm:h-12 sm:w-12"
        aria-hidden="true"
      />
      <h2 className="mt-3 text-base font-semibold text-slate-900 sm:text-lg">
        We couldn&apos;t find that shipment
      </h2>
      <p className="mt-1 max-w-sm text-sm text-slate-600">
        We don&apos;t have any tracking data for{' '}
        <span className="font-mono text-slate-800">{awb || '—'}</span>. Double
        check the AWB with the merchant, or try again later — the first scan
        from the courier may take a few hours.
      </p>
      <Link
        href="/track"
        className="mt-5 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Track a different number
      </Link>
    </div>
  );
}
