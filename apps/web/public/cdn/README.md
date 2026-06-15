# SwiftShip Embeddable Widgets (SS-022)

Three drop-in JavaScript widgets merchants can paste into any website —
no React, no Vue, no build step. The bundles live in this folder and
are served from `apps/web` as static files (Next.js will serve anything
under `public/` from `/<file>` at runtime, so the canonical URLs are
`/cdn/tracking.js`, `/cdn/returns.js`, `/cdn/rate-shop.js`, and
`/cdn/swiftship-loader.js`).

| Widget        | What it does                                                 | Source file        |
| ------------- | ------------------------------------------------------------ | ------------------ |
| Tracking      | Vertical timeline of scan events for a single AWB            | `tracking.js`      |
| Returns       | Compact card + "Open return portal" link                     | `returns.js`       |
| Rate-shop     | Top 3 cheapest + top 1 fastest courier quotes                | `rate-shop.js`     |
| Loader        | Single entry that dispatches to the right widget             | `swiftship-loader.js` |

All four files are vanilla JS, CSP-friendly (no dynamic code
construction, no inline event handlers), and iframe-safe (no
`parent.*` / `top.*` access). They mirror the styling of the
corresponding pages already shipped in `apps/web/app/track/[awb]/`,
`apps/web/app/return/[token]/`, and
`apps/admin-portal/app/rate-shop-widget/`.

---

## 1 · Tracking widget

Render a branded, vertical timeline of scan events for a single AWB.
Fetches from the existing public storefront route at
`<apiBaseUrl>/track/<awb>?tenant=<tenant>` — the same JSON contract
that powers `apps/web/app/track/[awb]/page.tsx`.

### Vanilla HTML

```html
<div id="swiftship-tracking"></div>
<script src="https://cdn.swiftship.ai/cdn/swiftship-loader.js"
        data-mode="tracking"
        data-tenant="acme"
        data-awb="SWIFT12345"
        data-theme="light"
        data-api-base-url="https://api.swiftship.ai"
        async></script>
```

### Shopify (Liquid)

Add to `sections/main-order.liquid` or a custom block:

```liquid
{% if order.tracking_number != blank %}
  <div id="swiftship-tracking-{{ order.id }}"></div>
  <script src="https://cdn.swiftship.ai/cdn/swiftship-loader.js"
          data-mode="tracking"
          data-tenant="{{ shop.permanent_domain | handleize }}"
          data-awb="{{ order.tracking_number }}"
          data-theme="light"
          async></script>
{% endif %}
```

### WordPress (functions.php shortcode)

```php
// In your theme's functions.php
add_shortcode('swiftship_tracking', function ($atts) {
  $a = shortcode_atts([
    'awb'    => '',
    'tenant' => '',
    'theme'  => 'light',
  ], $atts);
  $id = 'swiftship-tracking-' . wp_unique_id();
  ob_start(); ?>
    <div id="<?php echo esc_attr($id); ?>"></div>
    <script src="https://cdn.swiftship.ai/cdn/swiftship-loader.js"
            data-mode="tracking"
            data-tenant="<?php echo esc_attr($a['tenant']); ?>"
            data-awb="<?php echo esc_attr($a['awb']); ?>"
            data-theme="<?php echo esc_attr($a['theme']); ?>"
            async></script>
  <?php return ob_get_clean();
});

// Usage:  [swiftship_tracking awb="SWIFT12345" tenant="acme"]
```

### React (Next.js / CRA / Vite)

```tsx
import { useEffect, useRef } from 'react';

declare global { interface Window { swiftshipMount?: any } }

export function TrackingWidget({ awb, tenant, theme = 'light' }: { awb: string; tenant: string; theme?: 'light' | 'dark' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.swiftshipMount) return;
    window.swiftshipMount('tracking', { tenant, awb, theme, target: ref.current! });
  }, [awb, tenant, theme]);
  return <div ref={ref} />;
}
```

---

## 2 · Returns widget

A compact card with an "Open return portal" button that deep-links the
customer to the existing return portal at `<portalHost>/return/<token>`.
The widget does NOT issue any new backend calls — it only links to the
page built in SS-021.

### Vanilla HTML

```html
<div id="swiftship-returns"></div>
<script src="https://cdn.swiftship.ai/cdn/swiftship-loader.js"
        data-mode="returns"
        data-tenant="acme"
        data-token="rtk_abc123"
        data-summary="Order #12345 — ₹2,499"
        data-portal-host="shop.acme.in"
        data-theme="light"
        async></script>
```

### Shopify (order status page block)

```liquid
<div id="swiftship-returns-{{ order.id }}"></div>
<script src="https://cdn.swiftship.ai/cdn/swiftship-loader.js"
        data-mode="returns"
        data-tenant="{{ shop.permanent_domain | handleize }}"
        data-token="{{ order.return_token }}"
        data-summary="Order #{{ order.order_number }} — {{ order.total_price | money }}"
        async></script>
```

### WordPress (shortcode)

```php
add_shortcode('swiftship_returns', function ($atts) {
  $a = shortcode_atts([
    'token'   => '',
    'tenant'  => '',
    'summary' => '',
    'theme'   => 'light',
  ], $atts);
  $id = 'swiftship-returns-' . wp_unique_id();
  ob_start(); ?>
    <div id="<?php echo esc_attr($id); ?>"></div>
    <script src="https://cdn.swiftship.ai/cdn/swiftship-loader.js"
            data-mode="returns"
            data-tenant="<?php echo esc_attr($a['tenant']); ?>"
            data-token="<?php echo esc_attr($a['token']); ?>"
            data-summary="<?php echo esc_attr($a['summary']); ?>"
            data-theme="<?php echo esc_attr($a['theme']); ?>"
            async></script>
  <?php return ob_get_clean();
});

// Usage:  [swiftship_returns token="rtk_xxx" tenant="acme" summary="Order #12345"]
```

### React

```tsx
import { useEffect, useRef } from 'react';
declare global { interface Window { swiftshipMount?: any } }

export function ReturnsWidget({ token, tenant, summary }: { token: string; tenant: string; summary?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.swiftshipMount?.('returns', { token, tenant, summary, target: ref.current! });
  }, [token, tenant, summary]);
  return <div ref={ref} />;
}
```

---

## 3 · Rate-shop widget

A courier selector that fetches from the existing public rate-shop
REST endpoint (`POST <apiBaseUrl>/api/v1/rate-shop/rank`, guarded by
the tenant API key). Renders the top 3 cheapest quotes plus the single
fastest quote, deduplicated by carrier.

> **TODO(SS-022-backend)** — the bead description referenced a public
> `publicRateShop` GraphQL mutation, but that mutation is **not** in
> the backend today. The widget calls the already-deployed REST
> endpoint `POST /api/v1/rate-shop/rank` instead, which is
> tenant-scoped via the `X-Swiftship-Api-Key` header. The controller
> lives at
> `apps/api/src/rate-shop/rate-shop.public.controller.ts`. If you'd
> prefer a GraphQL mutation, see that file for the input/output
> shape; adding
> `publicRateShop(input: PublicRateShopInput!): [RateQuote!]!` to
> the GraphQL schema is a small follow-up.

### Vanilla HTML

```html
<div id="swiftship-rate-shop"></div>
<script src="https://cdn.swiftship.ai/cdn/swiftship-loader.js"
        data-mode="rate-shop"
        data-tenant="acme"
        data-api-key="pk_live_xxx"
        data-from="110001"
        data-to="560001"
        data-weight="500"
        data-cod="false"
        data-api-base-url="https://api.swiftship.ai"
        data-theme="light"
        async></script>
```

### Shopify (product page block)

```liquid
<div id="swiftship-rate-shop-{{ product.id }}"></div>
<script src="https://cdn.swiftship.ai/cdn/swiftship-loader.js"
        data-mode="rate-shop"
        data-tenant="{{ shop.permanent_domain | handleize }}"
        data-api-key="{{ shop.metafields.swiftship.api_key }}"
        data-from="{{ shop.customer.default_address.zip | default: '110001' }}"
        data-to="{{ cart.last.delivery_pincode | default: '560001' }}"
        data-weight="{{ product.weight | default: 500 }}"
        data-cod="{{ shop.metafields.swiftship.cod_default | default: 'false' }}"
        async></script>
```

### WordPress (shortcode — product page)

```php
add_shortcode('swiftship_rates', function ($atts) {
  $a = shortcode_atts([
    'tenant'  => '',
    'api_key' => '',
    'from'    => '110001',
    'to'      => '',
    'weight'  => '500',
    'cod'     => 'false',
    'theme'   => 'light',
  ], $atts);
  $id = 'swiftship-rate-shop-' . wp_unique_id();
  ob_start(); ?>
    <div id="<?php echo esc_attr($id); ?>"></div>
    <script src="https://cdn.swiftship.ai/cdn/swiftship-loader.js"
            data-mode="rate-shop"
            data-tenant="<?php echo esc_attr($a['tenant']); ?>"
            data-api-key="<?php echo esc_attr($a['api_key']); ?>"
            data-from="<?php echo esc_attr($a['from']); ?>"
            data-to="<?php echo esc_attr($a['to']); ?>"
            data-weight="<?php echo esc_attr($a['weight']); ?>"
            data-cod="<?php echo esc_attr($a['cod']); ?>"
            data-theme="<?php echo esc_attr($a['theme']); ?>"
            async></script>
  <?php return ob_get_clean();
});
// Usage:  [swiftship_rates tenant="acme" api_key="pk_xxx" to="560001" weight="500"]
```

### React

```tsx
import { useEffect, useRef } from 'react';
declare global { interface Window { swiftshipMount?: any } }

export function RateShopWidget(props: {
  tenant: string;
  apiKey: string;
  from: string;
  to: string;
  weight: number;
  cod?: boolean;
  apiBaseUrl?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.swiftshipMount?.('rate-shop', { ...props, target: ref.current! });
  }, [props.tenant, props.apiKey, props.from, props.to, props.weight, props.cod]);
  return <div ref={ref} />;
}
```

---

## API reference (one per widget)

The same widget can be mounted without a `<script>` tag, by calling the
JS API directly. Useful for SPAs and React/Vue:

```js
// Manual mount — order doesn't matter as long as the loader script
// is included once on the page.
swiftship('tracking', {
  tenant: 'acme',
  awb: 'SWIFT12345',
  theme: 'dark',                     // 'light' | 'dark'
  apiKey: 'pk_live_xxx',             // optional
  apiBaseUrl: 'https://api.swiftship.ai', // optional
  target: '#swiftship-tracking',     // CSS selector or HTMLElement
});
```

The return value is a `SwiftshipMountResult`:

```ts
{
  ready: Promise<void>,  // resolves when the widget has rendered
  element: HTMLElement,  // the host element
  destroy(): void,       // clears the host (re-mount is safe)
}
```

---

## CSP cheat sheet

If your host page has a strict Content-Security-Policy, you'll need:

```
script-src  https://cdn.swiftship.ai 'self';
style-src   'unsafe-inline';            /* widgets inject their own <style> */
connect-src https://api.swiftship.ai;    /* the API the widgets call */
img-src     https://cdn.swiftship.ai;    /* tenant logos in the tracking widget */
frame-ancestors *;                       /* only if the widget is in an iframe */
```

The widgets themselves never use dynamic code construction or inline
event handlers — they attach all listeners via `addEventListener`. They
never read `parent.*` or `top.*` (Shopify iframe-safe).

---

## File map

```
apps/web/public/cdn/
├── README.md                          ← you are here
├── swiftship-loader.js                ← single entry, dispatches by data-mode
├── tracking.js                        ← tracking widget bundle
├── returns.js                         ← returns widget bundle
├── rate-shop.js                       ← rate-shop widget bundle
└── widgets/
    ├── types.ts                       ← SwiftshipWidgetOptions type
    ├── tracking.ts                    ← tracking widget TS source
    ├── returns.ts                     ← returns widget TS source
    ├── rate-shop.ts                   ← rate-shop widget TS source
    └── __tests__/tracking.test.ts     ← Jest-style smoke test (skipped
                                         if Jest not wired into apps/web)
```

The `.js` files in `cdn/` are the canonical distribution — the
TypeScript sources under `widgets/` document the public API surface
and are the source of truth for any future build step. The two are
kept in lock-step by hand for now (no build pipeline).
