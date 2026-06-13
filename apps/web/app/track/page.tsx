'use client';

import { useState } from 'react';
import { useLazyQuery, gql } from '@apollo/client';

const TRACK_QUERY = gql`
  query Track($number: String!) {
    filterShipments(filter: { trackingNumber: $number }) {
      id
      trackingNumber
      status
      order {
        orderNumber
        destinationName
        destinationCity
        destinationPincode
      }
    }
  }
`;

export default function TrackPage() {
  const [number, setNumber] = useState('');
  const [run, { data, loading, error }] = useLazyQuery(TRACK_QUERY);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">Track a shipment</h1>
      <p className="mt-2 text-slate-600">
        Enter your tracking number (AWB) below.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (number.trim()) run({ variables: { number: number.trim() } });
        }}
        className="mt-6 flex gap-2"
      >
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="AWB1234567890"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
        >
          Track
        </button>
      </form>

      {loading && <div className="mt-6 text-slate-500">Looking up…</div>}
      {error && (
        <div className="mt-6 rounded-md border border-rose-300 bg-rose-50 p-4 text-rose-800">
          {error.message}
        </div>
      )}
      {data?.filterShipments?.length === 0 && !loading && (
        <div className="mt-6 text-slate-500">No shipment found.</div>
      )}
      {data?.filterShipments?.[0] && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-500">{data.filterShipments[0].trackingNumber}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            Status: {data.filterShipments[0].status}
          </div>
          <div className="mt-3 text-sm text-slate-600">
            Order #{data.filterShipments[0].order?.orderNumber} →{' '}
            {data.filterShipments[0].order?.destinationCity}{' '}
            {data.filterShipments[0].order?.destinationPincode}
          </div>
        </div>
      )}
    </main>
  );
}
