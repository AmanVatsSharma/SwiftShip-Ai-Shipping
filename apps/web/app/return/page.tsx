'use client';

import { useState } from 'react';
import { useRequestReturnToken } from '../../lib/returns';

/**
 * Public return-portal landing page.
 *
 * No auth: the customer enters their order ID + an email or phone, the
 * backend mints a magic-link token and emails/SMSes it to the contact.
 * The customer then opens /return/<token> on whichever device they like.
 *
 * Until the backend lands `requestReturnToken` (see TODO in
 * `apps/web/lib/returns.ts`), this page will show a clear error and not
 * pretend to have succeeded.
 */
export default function ReturnLandingPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [contact, setContact] = useState('');
  const [sent, setSent] = useState(false);

  const [requestToken, { loading, error }] = useRequestReturnToken();

  const onSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!orderNumber.trim() || !contact.trim()) return;
    setSent(false);
    requestToken({
      variables: { orderNumber: orderNumber.trim(), contact: contact.trim() },
    })
      .then((res: { data?: { requestReturnToken?: { delivered: boolean } } }) => {
        // The backend tells us it accepted the request. We don't expose
        // whether the order actually exists — that would be a soft
        // account-enumeration leak. Instead we always show the same
        // "check your inbox" copy.
        if (res.data?.requestReturnToken) setSent(true);
      })
      .catch(() => {
        // surfaced below via the `error` branch
    });
  };

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">
        Return an order
      </h1>
      <p className="mt-2 text-slate-600">
        Enter your order number and the email or phone used at checkout.
        We&apos;ll send you a secure link to choose which items to return.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="orderNumber"
            className="block text-sm font-medium text-slate-700"
          >
            Order number
          </label>
          <input
            id="orderNumber"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="ORD-12345"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
            required
          />
        </div>

        <div>
          <label
            htmlFor="contact"
            className="block text-sm font-medium text-slate-700"
          >
            Email or phone
          </label>
          <input
            id="contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? 'Sending link…' : 'Send link'}
        </button>
      </form>

      {sent && !error && (
        <div className="mt-6 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
          If that order + contact matches an active return, we&apos;ve sent a
          link. Check your inbox (or phone). It expires in 30 minutes.
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-md border border-rose-300 bg-rose-50 p-4 text-rose-800">
          <div className="font-medium">Couldn&apos;t send the link.</div>
          <div className="mt-1 text-sm">
            {error.message}
            {/* TODO(SS-021-backend): the `requestReturnToken` mutation does
                not exist yet. When it lands, this error branch becomes a
                real retry path instead of a permanent failure. */}
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-slate-500">
        By submitting you agree to our return policy. Items must be unworn,
        unwashed, and in original packaging where possible.
      </p>
    </main>
  );
}
