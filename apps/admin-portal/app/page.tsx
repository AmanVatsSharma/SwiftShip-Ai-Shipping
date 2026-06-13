import Link from 'next/link';

const NAV = [
  { href: '/orders',     label: 'Orders',     desc: 'Create, track, cancel' },
  { href: '/shipments',  label: 'Shipments',  desc: 'Labels, tracking, manifests' },
  { href: '/warehouses', label: 'Warehouses', desc: 'Inventory & coverage' },
  { href: '/ndr',        label: 'NDR',        desc: 'Non-delivery reports' },
  { href: '/cod',        label: 'COD',        desc: 'Cash-on-delivery' },
  { href: '/billing',    label: 'Billing',    desc: 'Invoices & GST' },
  { href: '/dashboard',  label: 'Dashboard',  desc: 'Revenue, SLA, trends' },
  { href: '/webhooks',   label: 'Webhooks',   desc: 'Outgoing subscriptions' },
  { href: '/settings',   label: 'Settings',   desc: 'Users, roles, plugins' },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold text-slate-900">SwiftShip Admin</h1>
        <p className="mt-2 text-slate-600">
          Operations console for owners, staff, and sellers.
        </p>
      </header>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-400 hover:shadow-sm"
          >
            <div className="text-base font-medium text-slate-900">{n.label}</div>
            <div className="mt-1 text-sm text-slate-500">{n.desc}</div>
          </Link>
        ))}
      </section>
    </main>
  );
}
