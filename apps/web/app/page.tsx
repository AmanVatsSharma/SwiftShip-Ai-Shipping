import Link from 'next/link';

const FEATURES = [
  { title: 'Multi-carrier', body: 'Delhivery, Xpressbees, BlueDart, DTDC, Ecom Express, Shadowfax, FedEx India, Gati — under one API.' },
  { title: 'AI rate shop',  body: 'Pick the cheapest, fastest, or best-rated courier per shipment automatically.' },
  { title: 'NDR & RTO',     body: 'Auto-calls, WhatsApp nudges, and one-click reattempt workflows.' },
  { title: 'COD remittance', body: 'Track, reconcile, and payout cash-on-delivery remittances.' },
  { title: 'GST invoices',  body: 'Generate CGST/SGST/IGST invoices with HSN codes and a financial-year sequence.' },
  { title: 'E-com sync',    body: 'Pull orders from Shopify and WooCommerce, push tracking back as fulfilled.' },
];

export default function HomePage() {
  return (
    <main>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h1 className="text-5xl font-semibold tracking-tight text-slate-900">
            Ship smarter with <span className="text-brand-600">SwiftShip AI</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            The AI-powered shipping platform for Indian D2C brands. Rate-shop
            across 8+ carriers, automate NDR, reconcile COD, and send GST
            invoices — all from one dashboard.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-brand-600 px-5 py-2.5 text-white shadow-sm hover:bg-brand-700"
            >
              Start free
            </Link>
            <Link
              href="/track"
              className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-slate-700 hover:bg-slate-50"
            >
              Track a shipment
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold text-slate-900">What's inside</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 p-5">
              <div className="text-base font-medium text-slate-900">{f.title}</div>
              <p className="mt-2 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
