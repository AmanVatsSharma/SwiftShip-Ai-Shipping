'use client';

import { useMemo, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const NDR_ANALYTICS_QUERY = gql`
  query NdrAnalytics(
    $reasonFilter: NdrAnalyticsFilter!
    $pincodeFilter: NdrAnalyticsFilter!
    $courierFilter: NdrAnalyticsFilter!
    $todFilter: NdrAnalyticsFilter!
  ) {
    reasons: ndrAnalytics(filter: $reasonFilter, limit: 10) {
      reason
      count
      recoveryRate
      avgAttempts
    }
    pincodes: ndrByPincode(filter: $pincodeFilter, limit: 20) {
      pincode
      count
      ndrRate
    }
    couriers: ndrByCourier(filter: $courierFilter) {
      courier
      count
      totalShipments
      ndrRate
    }
    timeOfDay: ndrByTimeOfDay(filter: $todFilter) {
      hour
      count
    }
  }
`;

/** Default range: last 30 days, end of "today" in UTC. */
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

const PRESETS: Array<{ label: string; days: number }> = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

const REASON_COLORS = [
  '#2976ff',
  '#0bb39a',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#3b82f6',
  '#64748b',
];

export default function NdrAnalyticsPage() {
  const [range, setRange] = useState(defaultRange());

  const variables = useMemo(
    () => ({
      reasonFilter: { range },
      pincodeFilter: { range },
      courierFilter: { range },
      todFilter: { range },
    }),
    [range],
  );

  const { data, loading, error, refetch } = useQuery(NDR_ANALYTICS_QUERY, {
    variables,
  });

  const setDays = (days: number) => {
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - days);
    setRange({ from: from.toISOString(), to: to.toISOString() });
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            NDR analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Diagnose where shipments are failing — by reason, destination,
            courier, and time of day.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </header>

      {loading && (
        <div className="p-8 text-slate-500">Loading NDR analytics…</div>
      )}
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-rose-800">
          Failed to load NDR analytics: {error.message}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Reasons (top 10)" subtitle="Why shipments are failing.">
            <PieChartBlock data={data.reasons ?? []} />
          </ChartCard>

          <ChartCard
            title="Top pincodes"
            subtitle="NDR rate per destination pincode (top 20)."
          >
            <PincodeBar data={data.pincodes ?? []} />
          </ChartCard>

          <ChartCard
            title="Courier comparison"
            subtitle="NDR rate per carrier across the window."
          >
            <CourierLine data={data.couriers ?? []} />
          </ChartCard>

          <ChartCard
            title="Time of day"
            subtitle="NDR count by hour (UTC) — 0 = midnight."
          >
            <TodHeatmap data={data.timeOfDay ?? []} />
          </ChartCard>
        </div>
      )}
    </main>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        )}
      </header>
      <div className="h-72">{children}</div>
    </section>
  );
}

function PieChartBlock({ data }: { data: Array<{ reason: string; count: number }> }) {
  if (data.length === 0) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="reason"
          cx="50%"
          cy="50%"
          outerRadius={90}
          label={(d: any) => `${d.reason} (${d.count})`}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={REASON_COLORS[i % REASON_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function PincodeBar({
  data,
}: {
  data: Array<{ pincode: string; count: number; ndrRate: number }>;
}) {
  if (data.length === 0) return <Empty />;
  // Truncate pincode label to the last 3 digits for compact display
  // (full 6 digits still appears in the tooltip).
  const compact = data.map((d) => ({
    pincode: d.pincode,
    ndrRatePct: Number((d.ndrRate * 100).toFixed(2)),
    count: d.count,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={compact}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="pincode" tick={{ fontSize: 10 }} interval={0} angle={-30} dy={10} height={50} />
        <YAxis unit="%" tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: any, n: any) =>
            n === 'ndrRatePct' ? [`${v}%`, 'NDR rate'] : [v, n]
          }
        />
        <Bar dataKey="ndrRatePct" fill="#2976ff" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CourierLine({
  data,
}: {
  data: Array<{ courier: string; ndrRate: number; count: number }>;
}) {
  if (data.length === 0) return <Empty />;
  const compact = data.map((d) => ({
    courier: d.courier,
    ndrRatePct: Number((d.ndrRate * 100).toFixed(2)),
    count: d.count,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={compact}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="courier" tick={{ fontSize: 10 }} interval={0} angle={-30} dy={10} height={50} />
        <YAxis unit="%" tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: any, n: any) =>
            n === 'ndrRatePct' ? [`${v}%`, 'NDR rate'] : [v, n]
          }
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="ndrRatePct"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Time-of-day heatmap. Renders as a 24-bar BarChart where color
 * intensity encodes count (a true heatmap would need a 7x24 grid +
 * weekend axis; this is the v1 that proves the data shape).
 */
function TodHeatmap({
  data,
}: {
  data: Array<{ hour: number; count: number }>;
}) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(1, ...data.map((b) => b.count));
  const cells = data.map((b) => ({
    hour: `${String(b.hour).padStart(2, '0')}:00`,
    count: b.count,
    intensity: b.count / max,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={cells}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 9 }}
          interval={1}
          angle={-45}
          dy={20}
          height={60}
        />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: any) => [v, 'NDRs']} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {cells.map((c, i) => (
            <Cell
              key={i}
              fill={`rgba(239, 68, 68, ${0.15 + 0.85 * c.intensity})`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      No data for this range.
    </div>
  );
}
