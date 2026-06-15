'use client';

import { useState } from 'react';
import type { UploadedPhoto } from '../../../lib/uploads';
import { PhotoUploader } from './PhotoUploader';
import type { OrderForReturn } from '../../../lib/returns';

const REASONS = [
  { value: 'SIZE_TOO_SMALL', label: 'Sized too small' },
  { value: 'SIZE_TOO_LARGE', label: 'Sized too large' },
  { value: 'DAMAGED', label: 'Damaged or defective' },
  { value: 'WRONG_ITEM', label: 'Wrong item shipped' },
  { value: 'NOT_AS_DESCRIBED', label: 'Not as described' },
  { value: 'CHANGED_MIND', label: 'Changed my mind' },
  { value: 'OTHER', label: 'Other' },
];

type Props = {
  item: OrderForReturn['items'][number];
  included: boolean;
  onIncludedChange: (next: boolean) => void;
  quantity: number;
  onQuantityChange: (next: number) => void;
  reason: string;
  onReasonChange: (next: string) => void;
  photos: UploadedPhoto[];
  onPhotosChange: (next: UploadedPhoto[]) => void;
  disabled?: boolean;
};

/**
 * Per-item card in the return portal. The customer opts the item in,
 * sets a quantity (1..purchased), picks a reason, and drops up to 3
 * photos. State is owned by the parent — this is a controlled view.
 */
export function ReturnItemCard({
  item,
  included,
  onIncludedChange,
  quantity,
  onQuantityChange,
  reason,
  onReasonChange,
  photos,
  onPhotosChange,
  disabled,
}: Props) {
  const [touched, setTouched] = useState(false);
  const reasonError = included && touched && !reason ? 'Pick a reason.' : '';

  return (
    <div
      className={[
        'rounded-lg border bg-white p-4 transition',
        included ? 'border-brand-300 ring-1 ring-brand-300' : 'border-slate-200',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => onIncludedChange(e.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4 rounded text-brand-600"
          aria-label={`Include ${item.name} in return`}
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {item.name}
            </h3>
            <div className="text-xs text-slate-500">
              {item.sku ? `SKU ${item.sku}` : ''}
            </div>
          </div>
          <div className="mt-1 text-sm text-slate-600">
            ₹{item.unitPrice.toLocaleString('en-IN')} · ordered {item.quantity}
          </div>
        </div>
      </div>

      {included && (
        <div className="mt-4 space-y-3 pl-7">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`qty-${item.id}`}
                className="block text-xs font-medium text-slate-600"
              >
                Quantity
              </label>
              <input
                id={`qty-${item.id}`}
                type="number"
                min={1}
                max={item.quantity}
                value={quantity}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) {
                    onQuantityChange(
                      Math.max(1, Math.min(item.quantity, Math.floor(v))),
                    );
                  }
                }}
                disabled={disabled}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none sm:max-w-[6rem]"
              />
            </div>
            <div>
              <label
                htmlFor={`reason-${item.id}`}
                className="block text-xs font-medium text-slate-600"
              >
                Reason
              </label>
              <select
                id={`reason-${item.id}`}
                value={reason}
                onChange={(e) => {
                  onReasonChange(e.target.value);
                  setTouched(true);
                }}
                onBlur={() => setTouched(true)}
                disabled={disabled}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus:border-brand-500 focus:outline-none"
              >
                <option value="">Choose a reason…</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {reasonError && (
                <div className="mt-1 text-xs text-rose-600">{reasonError}</div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">
              Photos (optional, but helpful for damage / wrong-item)
            </div>
            <PhotoUploader
              initial={photos}
              onUploaded={onPhotosChange}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
