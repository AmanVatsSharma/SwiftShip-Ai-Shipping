'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useAddReturnItem,
  useAttachReturnPhoto,
  useChooseRefundMethod,
  useCreateReturn,
  useRequestReturnPickup,
  useResolveReturnToken,
  type OrderForReturn,
  type RefundMethod,
  type ReturnItem as ReturnItemT,
} from '../../../lib/returns';
import type { UploadedPhoto } from '../../../lib/uploads';
import { ReturnItemCard } from './ReturnItemCard';
import { RefundMethodPicker } from './RefundMethodPicker';
import { ReversePickupToggle } from './ReversePickupToggle';

/**
 * Per-line local state for an item the customer is composing into the
 * return. Photos are kept locally until the backend wires the
 * ReturnItem->ReturnPhoto link; on submit we fire
 * addReturnItem(quantity, reason) and then attachReturnPhoto(photoKey)
 * for each photo.
 */
type DraftItem = {
  included: boolean;
  quantity: number;
  reason: string;
  photos: UploadedPhoto[];
  returnItemId?: number;
};

const emptyDraft = (item: OrderForReturn['items'][number]): DraftItem => ({
  included: false,
  quantity: 1,
  reason: '',
  photos: [],
});

type Props = { params: Promise<{ token: string }> };

/**
 * Magic-link-authenticated return portal.
 *
 * Flow:
 *   1. Resolve the token to an order (and an in-progress return, if any).
 *   2. The customer opts items in, sets qty + reason + photos.
 *   3. They pick a refund method and (optionally) a reverse-pickup slot.
 *   4. On submit we create the Return, then add each item + each photo
 *      via the returns GraphQL mutations.
 *
 * See apps/web/lib/returns.ts for the full TODO(SS-021-backend) list —
 * several of the mutations we call are not in the backend yet, and
 * will fail loudly. The UI does not pretend they worked.
 */
export default function ReturnPortalPage({ params }: Props) {
  // Next.js 14 unwraps params via `use()` in client components.
  const { token } = use(params);
  const { data, loading, error } = useResolveReturnToken(token);

  const [createReturn] = useCreateReturn();
  const [addReturnItem] = useAddReturnItem();
  const [attachReturnPhoto] = useAttachReturnPhoto();
  const [chooseRefundMethod] = useChooseRefundMethod();
  const [requestPickup] = useRequestReturnPickup();

  const [refundMethod, setRefundMethod] = useState<RefundMethod | null>(null);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [pickupAt, setPickupAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [doneReturnNumber, setDoneReturnNumber] = useState<string | null>(null);

  const order = data?.resolveReturnToken?.order ?? null;
  const existingReturn = data?.resolveReturnToken?.existingReturn ?? null;

  // Seed the per-item draft from the existing return (if any) so the
  // customer can resume.
  const initialDrafts = useMemo(() => {
    if (!order) return [] as Record<number, DraftItem>[];
    const drafts: Record<number, DraftItem> = {};
    for (const it of order.items) drafts[it.id] = emptyDraft(it);
    if (existingReturn?.items) {
      for (const ri of existingReturn.items as ReturnItemT[]) {
        drafts[ri.orderItemId] = {
          included: true,
          quantity: ri.quantity,
          reason: ri.reason,
          photos: ri.photos.map((p) => ({
            key: p.key,
            publicUrl: p.publicUrl,
            contentType: p.contentType,
            sizeBytes: p.sizeBytes,
          })),
          returnItemId: ri.id,
        };
      }
    }
    return drafts;
  }, [order, existingReturn]);

  const [drafts, setDrafts] = useState<Record<number, DraftItem>>({});

  // First render after data arrives: copy server state into local drafts
  // once. (The `useMemo` above can't write to state.)
  if (order && Object.keys(drafts).length === 0 && initialDrafts.length > 0) {
    // The useMemo above returns an array of length 1; collapse it.
    // We rebuild drafts keyed by order item id here.
    const initial: Record<number, DraftItem> = {};
    for (const it of order.items) {
      const fromExisting = existingReturn?.items?.find(
        (ri: ReturnItemT) => ri.orderItemId === it.id,
      );
      if (fromExisting) {
        initial[it.id] = {
          included: true,
          quantity: fromExisting.quantity,
          reason: fromExisting.reason,
          photos: fromExisting.photos.map((p: ReturnItemT['photos'][number]) => ({
            key: p.key,
            publicUrl: p.publicUrl,
            contentType: p.contentType,
            sizeBytes: p.sizeBytes,
          })),
          returnItemId: fromExisting.id,
        };
      } else {
        initial[it.id] = emptyDraft(it);
      }
    }
    // schedule a state write for next tick
    queueMicrotask(() => setDrafts(initial));
  }

  const updateDraft = (id: number, patch: Partial<DraftItem>) => {
    setDrafts((prev: Record<number, DraftItem>) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const includedCount = order
    ? order.items.filter((it) => drafts[it.id]?.included).length
    : 0;

  const onSubmit = async () => {
    if (!order) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // 1. Create the Return. Use a unique returnNumber (year + short id).
      const returnNumber = `RET-${order.orderNumber}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const created = await createReturn({
        variables: {
          input: {
            returnNumber,
            // The backend's CreateReturnInput insists on a status; the only
            // legal initial value is REQUESTED.
            status: 'REQUESTED',
            reason: 'pending', // refined per-item below
            orderId: order.id,
          },
        },
      });
      const returnId = created.data?.createReturn?.id;
      if (!returnId) throw new Error('Failed to create return.');

      // 2. For each included item, add a ReturnItem and attach its photos.
      for (const it of order.items) {
        const d = drafts[it.id];
        if (!d?.included) continue;
        const itemRes = await addReturnItem({
          variables: {
            returnId,
            orderItemId: it.id,
            quantity: d.quantity,
            reason: d.reason,
          },
        });
        const returnItemId = itemRes.data?.addReturnItem?.id;
        if (!returnItemId) continue;
        for (const photo of d.photos) {
          await attachReturnPhoto({
            variables: {
              returnItemId,
              key: photo.key,
              contentType: photo.contentType,
              sizeBytes: Math.floor(photo.sizeBytes),
            },
          });
        }
      }

      // 3. Refund method.
      if (refundMethod) {
        await chooseRefundMethod({
          variables: { returnId, method: refundMethod },
        });
      }

      // 4. Optional reverse pickup.
      if (pickupEnabled && pickupAt) {
        const iso = new Date(pickupAt).toISOString();
        await requestPickup({
          variables: { returnId, scheduledAt: iso },
        });
      }

      setDoneReturnNumber(created.data?.createReturn?.returnNumber ?? null);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-slate-500">
        Loading your return…
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-slate-900">
          We couldn&apos;t open your return
        </h1>
        <p className="mt-2 text-slate-600">{error.message}</p>
        <Link
          href="/return"
          className="mt-4 inline-block text-brand-600 underline"
        >
          Start over
        </Link>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-slate-900">
          Link expired or invalid
        </h1>
        <p className="mt-2 text-slate-600">
          This return link is no longer active. Please request a new one.
        </p>
        <Link
          href="/return"
          className="mt-4 inline-block text-brand-600 underline"
        >
          Request a new link
        </Link>
      </main>
    );
  }

  if (doneReturnNumber) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-slate-900">
          Return submitted
        </h1>
        <p className="mt-2 text-slate-600">
          Your return <span className="font-mono">{doneReturnNumber}</span> is
          in. We&apos;ll email you when it&apos;s approved and the courier is
          on the way.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 sm:py-12">
      <header className="border-b border-slate-200 pb-4">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Return
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Order #{order.orderNumber}
        </h1>
        <div className="mt-1 text-sm text-slate-600">
          Shipped to {order.destinationName}, {order.destinationCity}{' '}
          {order.destinationPincode} · ₹
          {order.total.toLocaleString('en-IN')}
        </div>
      </header>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-slate-900">
          Which items are you returning?
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Tick the items you want to send back, set a quantity, and tell us
          why.
        </p>
        <div className="mt-4 space-y-3">
          {order.items.map((it) => {
            const d =
              drafts[it.id] ??
              (Object.keys(drafts).length === 0
                ? emptyDraft(it)
                : emptyDraft(it));
            return (
              <ReturnItemCard
                key={it.id}
                item={it}
                included={d.included}
                onIncludedChange={(v) => updateDraft(it.id, { included: v })}
                quantity={d.quantity}
                onQuantityChange={(v) => updateDraft(it.id, { quantity: v })}
                reason={d.reason}
                onReasonChange={(v) => updateDraft(it.id, { reason: v })}
                photos={d.photos}
                onPhotosChange={(photos) =>
                  updateDraft(it.id, { photos })
                }
                disabled={submitting}
              />
            );
          })}
        </div>
      </section>

      <section className="mt-8 space-y-6">
        <RefundMethodPicker
          value={refundMethod}
          onChange={setRefundMethod}
          disabled={submitting}
        />
        <ReversePickupToggle
          enabled={pickupEnabled}
          onToggle={setPickupEnabled}
          scheduledAt={pickupAt}
          onScheduledAtChange={setPickupAt}
          disabled={submitting}
        />
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          {includedCount} item{includedCount === 1 ? '' : 's'} selected
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || includedCount === 0}
          className="rounded-md bg-brand-600 px-5 py-2.5 text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit return'}
        </button>
      </div>

      {submitError && (
        <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-4 text-rose-800">
          <div className="font-medium">Couldn&apos;t submit your return.</div>
          <div className="mt-1 text-sm">{submitError}</div>
        </div>
      )}
    </main>
  );
}
