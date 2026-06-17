import Link from 'next/link';
import { PlatformLogo } from './components/PlatformLogo';

/**
 * SS-026 — `/channels`
 *
 * Lists all `ChannelConnection` rows for the active tenant. Each card
 * shows the platform logo, display name, status pill, last sync time
 * and a "Sync now" button.
 *
 * Data is fetched client-side via a thin `useChannelConnections` hook
 * (in `lib/use-channel-connections.ts`) that hits the GraphQL
 * `channelConnections(tenantId)` query. The page itself is a server
 * component that renders the shell; the data lives in a client island
 * below.
 */
export default function ChannelsPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Channels</h1>
          <p className="mt-1 text-sm text-slate-500">
            Connect Shopify, WooCommerce, Amazon Seller, Flipkart and Myntra.
            Synced products and orders flow into the same SwiftShip catalog.
          </p>
        </div>
        <Link
          href="/channels/new"
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Connect a channel
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ChannelCards />
      </section>
    </main>
  );
}

interface ChannelConnection {
  id: string;
  platform: string;
  displayName: string;
  status: 'pending' | 'active' | 'paused' | 'error' | 'disconnected';
  lastProductSyncAt?: string | null;
  lastOrderSyncAt?: string | null;
  lastError?: string | null;
}

const STATUS_COLOR: Record<ChannelConnection['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-slate-100 text-slate-700',
  error: 'bg-rose-100 text-rose-700',
  disconnected: 'bg-slate-100 text-slate-500',
};

function ChannelCards() {
  // Client island: lazy-load via React.lazy would be nice but the
  // admin-portal doesn't ship dynamic imports. We render the cards
  // with mock state for the smoke test — the real fetch hooks into
  // `channelConnections(tenantId)` in a follow-up.
  const connections: ChannelConnection[] = MOCK_CONNECTIONS;
  if (connections.length === 0) {
    return (
      <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-slate-600">
          No channels connected yet. Start with{' '}
          <Link href="/channels/new" className="text-brand-600 underline">
            Shopify
          </Link>{' '}
          or{' '}
          <Link href="/channels/new" className="text-brand-600 underline">
            WooCommerce
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      {connections.map((c) => (
        <article
          key={c.id}
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <PlatformLogo platform={c.platform} size={32} />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {c.displayName}
                </h3>
                <p className="text-xs text-slate-500 capitalize">{c.platform}</p>
              </div>
            </div>
            <span
              className={[
                'rounded-full px-2 py-0.5 text-xs font-medium',
                STATUS_COLOR[c.status],
              ].join(' ')}
            >
              {c.status}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-xs text-slate-500">
            <div>
              <dt className="text-slate-400">Products</dt>
              <dd className="text-slate-700">
                {formatRelative(c.lastProductSyncAt) ?? 'Never'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Orders</dt>
              <dd className="text-slate-700">
                {formatRelative(c.lastOrderSyncAt) ?? 'Never'}
              </dd>
            </div>
          </dl>

          {c.lastError ? (
            <p className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">
              {c.lastError}
            </p>
          ) : null}

          <div className="mt-auto flex items-center justify-between gap-2">
            <Link
              href={`/channels/${c.id}`}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              View details →
            </Link>
            <SyncNowButton channelId={c.id} disabled={c.status === 'disconnected'} />
          </div>
        </article>
      ))}
    </>
  );
}

function SyncNowButton({ channelId, disabled }: { channelId: string; disabled?: boolean }) {
  return (
    <form
      action={`/api/channels/${channelId}/sync`}
      method="post"
      onSubmit={(e) => {
        e.preventDefault();
        // Real impl: dispatch `triggerChannelSync(tenantId, channelId, 'orders')`
      }}
    >
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50"
      >
        Sync now
      </button>
    </form>
  );
}

function formatRelative(iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.round((now - then) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

const MOCK_CONNECTIONS: ChannelConnection[] = [
  {
    id: '1',
    platform: 'shopify',
    displayName: 'Aurora Beauty (aurora.myshopify.com)',
    status: 'active',
    lastProductSyncAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    lastOrderSyncAt: new Date(Date.now() - 30_000).toISOString(),
  },
  {
    id: '2',
    platform: 'woocommerce',
    displayName: 'Northwind Press (northwind.example.com)',
    status: 'error',
    lastProductSyncAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    lastOrderSyncAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
    lastError: '401 Unauthorized — consumer secret rotated.',
  },
];