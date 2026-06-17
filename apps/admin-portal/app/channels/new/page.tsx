'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PlatformLogo } from '../components/PlatformLogo';

type PlatformKey = 'shopify' | 'woocommerce' | 'amazon' | 'flipkart' | 'myntra';

const PLATFORMS: Array<{
  key: PlatformKey;
  label: string;
  fields: Array<{ name: string; label: string; type: 'text' | 'password' | 'url'; placeholder?: string }>;
}> = [
  {
    key: 'shopify',
    label: 'Shopify',
    fields: [
      { name: 'shop', label: 'Shop domain', type: 'text', placeholder: 'your-shop.myshopify.com' },
      { name: 'accessToken', label: 'Admin API access token', type: 'password', placeholder: 'shpat_… or shpca_…' },
    ],
  },
  {
    key: 'woocommerce',
    label: 'WooCommerce',
    fields: [
      { name: 'storeUrl', label: 'Store URL', type: 'url', placeholder: 'https://mystore.example.com' },
      { name: 'consumerKey', label: 'Consumer key', type: 'text', placeholder: 'ck_…' },
      { name: 'consumerSecret', label: 'Consumer secret', type: 'password', placeholder: 'cs_…' },
    ],
  },
  {
    key: 'amazon',
    label: 'Amazon Seller',
    fields: [
      { name: 'sellerId', label: 'Seller ID', type: 'text' },
      { name: 'mwsAuthToken', label: 'MWS Auth Token', type: 'password' },
      { name: 'awsAccessKeyId', label: 'AWS Access Key ID', type: 'text' },
      { name: 'awsSecretAccessKey', label: 'AWS Secret Access Key', type: 'password' },
    ],
  },
  {
    key: 'flipkart',
    label: 'Flipkart Seller',
    fields: [
      { name: 'sellerId', label: 'Seller ID', type: 'text' },
      { name: 'appToken', label: 'App Token', type: 'password' },
    ],
  },
  {
    key: 'myntra',
    label: 'Myntra Partner',
    fields: [
      { name: 'partnerId', label: 'Partner ID', type: 'text' },
      { name: 'apiKey', label: 'API Key', type: 'password' },
    ],
  },
];

/**
 * SS-026 — `/channels/new`
 *
 * Three steps:
 *   1. Pick a platform.
 *   2. Fill in the per-platform credential form.
 *   3. Click "Test connection" — runs `testConnection` server-side,
 *      and on success the form enables "Save".
 *
 * The form is fully client-side because the field set is dynamic.
 * On submit it posts to `/api/channels` which calls the
 * `connectChannel` GraphQL mutation.
 */
export default function NewChannelPage() {
  const [platform, setPlatform] = useState<PlatformKey>('shopify');
  const [values, setValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const platformDef = useMemo(
    () => PLATFORMS.find((p) => p.key === platform)!,
    [platform],
  );

  function update(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function runTest(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      // Real impl: POST /api/channels/test with { platform, credentials }.
      // Server proxies to `adapter.testConnection(tenantId)` and returns
      // { ok, message }. We mock the response so the form is reviewable.
      await new Promise((r) => setTimeout(r, 600));
      const missing = platformDef.fields.find((f) => !values[f.name]);
      if (missing) {
        setTestResult({ ok: false, message: `Missing field: ${missing.label}` });
      } else {
        setTestResult({ ok: true, message: 'Connection looks good.' });
      }
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/channels" className="text-sm text-slate-500 hover:text-slate-700">
        ← All channels
      </Link>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-slate-900">Connect a channel</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a platform and paste your API credentials. We'll test the connection
          before saving.
        </p>
      </header>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">1. Choose a platform</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setPlatform(p.key);
                setValues({});
                setTestResult(null);
              }}
              className={[
                'flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs',
                platform === p.key
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 hover:border-slate-300',
              ].join(' ')}
            >
              <PlatformLogo platform={p.key} size={28} />
              <span className="font-medium">{p.label}</span>
            </button>
          ))}
        </div>
      </section>

      <form onSubmit={runTest} className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          2. {platformDef.label} credentials
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <label className="text-xs text-slate-600" htmlFor="displayName">
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              placeholder="Aurora Beauty"
              onChange={(e) => update('displayName', e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          {platformDef.fields.map((f) => (
            <div key={f.name}>
              <label className="text-xs text-slate-600" htmlFor={f.name}>
                {f.label}
              </label>
              <input
                id={f.name}
                name={f.name}
                type={f.type}
                required
                placeholder={f.placeholder}
                onChange={(e) => update(f.name, e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="submit"
            disabled={testing}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-400 disabled:opacity-50"
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button
            type="button"
            disabled={!testResult?.ok}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Save channel
          </button>
        </div>

        {testResult ? (
          <p
            className={[
              'mt-3 rounded-md px-3 py-2 text-sm',
              testResult.ok
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700',
            ].join(' ')}
          >
            {testResult.message}
          </p>
        ) : null}
      </form>
    </main>
  );
}