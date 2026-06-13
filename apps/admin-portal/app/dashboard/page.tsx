'use client';

import { useQuery, gql } from '@apollo/client';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const DASHBOARD_QUERY = gql`
  query Dashboard {
    revenueAnalytics {
      totalRevenue
      orderCount
      averageOrderValue
      paidOrderCount
    }
    totalSales
  }
`;

export default function DashboardPage() {
  const { data, loading, error } = useQuery(DASHBOARD_QUERY);

  if (loading) return <div className="p-8 text-slate-500">Loading dashboard…</div>;
  if (error)
    return (
      <div className="p-8 text-rose-700">
        Failed to load dashboard: {error.message}
      </div>
    );

  const r = data?.revenueAnalytics;
  const total = data?.totalSales ?? 0;
  const chart = r ? [
    { name: 'Total',     value: Number(r.totalRevenue ?? 0) },
    { name: 'Paid',      value: Number(r.paidOrderCount ?? 0) },
    { name: 'Avg Order', value: Number(r.averageOrderValue ?? 0) },
  ] : [];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Dashboard</h1>
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card label="Total sales"   value={`₹${Number(total).toFixed(2)}`} />
        <Card label="Paid orders"   value={r?.paidOrderCount ?? '—'} />
        <Card label="Avg order"     value={`₹${Number(r?.averageOrderValue ?? 0).toFixed(2)}`} />
      </section>
      <div className="h-80 rounded-lg border border-slate-200 bg-white p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#2976ff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
