'use client';

import type { RefundMethod } from '../../../lib/returns';

const OPTIONS: { value: RefundMethod; title: string; body: string }[] = [
  {
    value: 'ORIGINAL',
    title: 'Original payment source',
    body: 'Refund to the card, UPI, or wallet you paid with. 5-7 business days.',
  },
  {
    value: 'WALLET',
    title: 'Wallet credit',
    body: 'Instant credit to your SwiftShip wallet — usable on your next order.',
  },
  {
    value: 'BANK',
    title: 'Bank transfer (NEFT / IMPS)',
    body: 'For cash-on-delivery orders. We will ask for account details next.',
  },
];

type Props = {
  value: RefundMethod | null;
  onChange: (next: RefundMethod) => void;
  disabled?: boolean;
};

/**
 * Radio group for refund-method selection. Mobile-first: stacks on small
 * screens, two-up on >= sm.
 */
export function RefundMethodPicker({ value, onChange, disabled }: Props) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-slate-700">
        Refund method
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={[
                'flex cursor-pointer flex-col rounded-md border p-3 transition',
                selected
                  ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                  : 'border-slate-200 bg-white hover:border-slate-300',
                disabled ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refundMethod"
                  value={opt.value}
                  checked={selected}
                  onChange={() => onChange(opt.value)}
                  className="h-4 w-4 text-brand-600"
                />
                <span className="text-sm font-medium text-slate-900">
                  {opt.title}
                </span>
              </div>
              <p className="mt-1 pl-6 text-xs text-slate-600">{opt.body}</p>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
