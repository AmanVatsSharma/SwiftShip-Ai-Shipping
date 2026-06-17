import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlatformLogo } from '../components/PlatformLogo';

interface SyncJob {
  id: string;
  type: 'products' | 'orders';
  status: 'queued' | 'running' | 'success' | 'partial' | 'failed';
  startedAt?: string | null;
  finishedAt?: string | null;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  itemsFailed: number;
  errorMessage?: string | null;
}

const STATUS_COLOR: Record<SyncJob['status'], string> = {
  queued: 'bg-slate-100 text-slate-700',
  running: 'bg-amber-100 text-amber-700',
  success: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-rose-100 text-rose-700',
};

export default function ChannelDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // Server component — the real impl reads `channelConnection(tenantId, id)`
  // and `channelSyncJobs(tenantId, id, undefined, 50)` via the GraphQL
  // client. For SS-026 the data is mocked; wiring to the live GraphQL
  // surface happens in a follow-up PR.
  const conn = MOCK_CONNECTIONS.find((c) => c.id === params.id);
  if (!conn) {
    notFound();
  }
  const jobs = MOCK_JOBS;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/channels"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← All channels
      </Link>

      <header className="mt-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <PlatformLogo platform={conn.platform} size={40} />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {conn.displayName}
            </h1>
            <p className="text-sm text-slate-500 capitalize">
              {conn.platform} · <span className="font-medium">{conn.status}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-400">
            Sync now
          </button>
          <button className="rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
            Disconnect
          </button>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-900">Settings</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Sync mode" value={conn.settings.syncMode} />
            <Row label="Conflict mode" value={conn.settings.conflictMode ?? '—'} />
            <Row
              label="Default warehouse"
              value={conn.settings.defaultWarehouseCode ?? '—'}
            />
            <Row
              label="Skip statuses"
              value={(conn.settings.skipOrderStatuses ?? []).join(', ') || '—'}
            />
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Sync history</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3">Updated</th>
                  <th className="py-2 pr-3">Skipped</th>
                  <th className="py-2 pr-3">Failed</th>
                  <th className="py-2 pr-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 capitalize">{j.type}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_COLOR[j.status],
                        ].join(' ')}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{j.itemsCreated}</td>
                    <td className="py-2 pr-3">{j.itemsUpdated}</td>
                    <td className="py-2 pr-3">{j.itemsSkipped}</td>
                    <td className="py-2 pr-3">{j.itemsFailed}</td>
                    <td className="py-2 pr-3 text-slate-500">
                      {j.startedAt ? new Date(j.startedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No sync jobs yet. Trigger a sync from the button above.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}

interface ConnectionMock {
  id: string;
  platform: string;
  displayName: string;
  status: 'pending' | 'active' | 'paused' | 'error' | 'disconnected';
  settings: {
    syncMode: 'one_way_in' | 'one_way_out' | 'two_way';
    conflictMode?: 'skip' | 'overwrite' | 'merge';
    defaultWarehouseCode?: string;
    skipOrderStatuses?: string[];
  };
}

const MOCK_CONNECTIONS: ConnectionMock[] = [
  {
    id: '1',
    platform: 'shopify',
    displayName: 'Aurora Beauty (aurora.myshopify.com)',
    status: 'active',
    settings: {
      syncMode: 'two_way',
      conflictMode: 'merge',
      defaultWarehouseCode: 'BLR-01',
      skipOrderStatuses: ['cancelled', 'refunded'],
    },
  },
  {
    id: '2',
    platform: 'woocommerce',
    displayName: 'Northwind Press (northwind.example.com)',
    status: 'error',
    settings: { syncMode: 'one_way_in', defaultWarehouseCode: 'DEL-03' },
  },
];

const MOCK_JOBS: SyncJob[] = [
  {
    id: '101',
    type: 'orders',
    status: 'success',
    startedAt: new Date(Date.now() - 30_000).toISOString(),
    finishedAt: new Date(Date.now() - 25_000).toISOString(),
    itemsProcessed: 14,
    itemsCreated: 11,
    itemsUpdated: 2,
    itemsSkipped: 1,
    itemsFailed: 0,
  },
  {
    id: '102',
    type: 'products',
    status: 'success',
    startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    finishedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    itemsProcessed: 240,
    itemsCreated: 0,
    itemsUpdated: 240,
    itemsSkipped: 0,
    itemsFailed: 0,
  },
  {
    id: '103',
    type: 'orders',
    status: 'failed',
    startedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    finishedAt: new Date(Date.now() - 24 * 60_000).toISOString(),
    itemsProcessed: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    errorMessage: '401 Unauthorized — consumer secret rotated.',
  },
];