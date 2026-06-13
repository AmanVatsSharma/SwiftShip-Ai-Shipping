'use client';

import { useQuery, gql } from '@apollo/client';

const ORDERS_QUERY = gql`
  query Orders {
    orders {
      id
      orderNumber
      status
      paymentStatus
      total
      destinationName
      destinationCity
      destinationPincode
      createdAt
    }
  }
`;

const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-800',
  PAID:      'bg-emerald-100 text-emerald-800',
  SHIPPED:   'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-200 text-slate-700',
  REFUNDED:  'bg-rose-100 text-rose-800',
};

export default function OrdersPage() {
  const { data, loading, error, refetch } = useQuery(ORDERS_QUERY);

  if (loading) {
    return <div className="p-8 text-slate-500">Loading orders…</div>;
  }
  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-rose-800">
          Failed to load orders: {error.message}
        </div>
        <button
          onClick={() => refetch()}
          className="mt-3 rounded-md bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const orders = data?.orders ?? [];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Orders</h1>
        <button
          onClick={() => refetch()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Refresh
        </button>
      </header>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Order</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Payment</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">Destination</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o: any) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-500">{o.id}</td>
                <td className="px-4 py-2 font-medium">{o.orderNumber}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[o.status] ?? 'bg-slate-100 text-slate-700'}`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-2">{o.paymentStatus}</td>
                <td className="px-4 py-2 text-right">₹{Number(o.total).toFixed(2)}</td>
                <td className="px-4 py-2">
                  {o.destinationCity ?? '—'}
                  <span className="ml-1 text-slate-400">{o.destinationPincode}</span>
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(o.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
