'use client';

type Props = {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  /** ISO datetime. Empty string = unset. */
  scheduledAt: string;
  onScheduledAtChange: (next: string) => void;
  disabled?: boolean;
};

/**
 * Reverse-pickup toggle + plain HTML datetime-local input. No library.
 * The customer opts in to having a courier come pick the return up
 * (alternative: self-ship to a hub).
 */
export function ReversePickupToggle({
  enabled,
  onToggle,
  scheduledAt,
  onScheduledAtChange,
  disabled,
}: Props) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded text-brand-600"
        />
        <span className="text-sm font-medium text-slate-900">
          Schedule a reverse pickup from my address
        </span>
      </label>

      {enabled && (
        <div className="mt-3 pl-7">
          <label
            htmlFor="pickupAt"
            className="block text-xs font-medium text-slate-600"
          >
            Preferred pickup slot
          </label>
          <input
            id="pickupAt"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => onScheduledAtChange(e.target.value)}
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none sm:max-w-xs"
          />
          <p className="mt-1 text-xs text-slate-500">
            Pick a slot between 9am and 7pm. We&apos;ll confirm by SMS.
          </p>
        </div>
      )}
    </div>
  );
}
