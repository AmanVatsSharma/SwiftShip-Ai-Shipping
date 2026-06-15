'use client';

import { Check, Circle, MapPin } from 'lucide-react';
import { formatDateTime } from '@swiftship/shared-ui';
import type { TrackingEvent } from '../../../../lib/tracking';

interface TrackTimelineProps {
  events: TrackingEvent[];
}

/**
 * Visual timeline of tracking events. Renders newest-first. Each row shows:
 *   • a circle marker (filled for the most recent event, hollow otherwise)
 *   • the formatted occurredAt timestamp
 *   • the status, location and description
 *
 * Mobile-first: stacks nicely on small screens, the marker column shrinks.
 */
export function TrackTimeline({ events }: TrackTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
        We don&apos;t have any tracking scans for this AWB yet. The first scan
        from the courier usually appears within a few hours of pickup.
      </div>
    );
  }

  // Newest first.
  const ordered = [...events].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return (
    <ol
      role="list"
      className="relative space-y-4 border-l border-slate-200 pl-5 sm:space-y-5 sm:pl-6"
    >
      {ordered.map((event, idx) => {
        const isFirst = idx === 0;
        const status = event.status?.replace(/_/g, ' ').toLowerCase() ?? 'scan';
        return (
          <li key={event.id} className="relative">
            <span
              className={`absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white sm:-left-[31px] ${
                isFirst
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 text-slate-400'
              }`}
              aria-hidden="true"
            >
              {isFirst ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                <Circle className="h-2.5 w-2.5" fill="currentColor" />
              )}
            </span>

            <div className="flex flex-col gap-0.5">
              <time
                dateTime={event.occurredAt}
                className="text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                {formatDateTime(event.occurredAt)}
              </time>
              <div className="text-sm font-semibold capitalize text-slate-900">
                {status}
              </div>
              {event.location && (
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  <span>{event.location}</span>
                </div>
              )}
              {event.description && (
                <p className="mt-1 text-sm text-slate-600">
                  {event.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
