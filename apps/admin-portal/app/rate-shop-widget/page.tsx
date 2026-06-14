'use client';

import { useState } from 'react';

/**
 * SS-014: Admin publish page for the embeddable rate-shop widget.
 *
 * Shows the merchant a copy-paste-able HTML snippet that:
 *  1. Loads the widget script + stylesheet from the public web app.
 *  2. Mounts the widget into a host `<div>` with the merchant's
 *     origin pincode + their (visible) API key.
 *
 * The API key is embedded in the script by design — the widget
 * uses it as a public rate-shop credential, rotated from the
 * admin portal at any time. Treat it like a Stripe publishable key.
 */
export default function RateShopWidgetPage() {
  // TODO: read from tenant context once the admin session is wired.
  const apiKey = 'demo_api_key';
  const originPincode = '110001';
  const [copied, setCopied] = useState(false);

  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL || 'https://api.swiftship.ai';
  const webUrl =
    process.env.NEXT_PUBLIC_WEB_URL || 'https://web.swiftship.ai';

  const embed = `<!-- SwiftShip Rate-Shop Widget -->
<link rel="stylesheet" href="${webUrl}/rate-shop.css">
<script src="${webUrl}/rate-shop.js"></script>
<div id="swiftship-rates"></div>
<script>
  SwiftShipRateShop.init('#swiftship-rates', '${apiKey}', {
    originPincode: '${originPincode}',
    strategy: 'best_value',
  });
</script>`;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Rate Shop Widget</h1>
      <p className="text-gray-600 mb-6">
        Copy this code and paste it on your Shopify, WooCommerce, or any
        website. Your API key is visible in the embed by design — rotate it
        from this page at any time.
      </p>

      <div className="mb-4 text-sm text-gray-500">
        <div>
          <span className="font-medium">API endpoint:</span> {baseUrl}
          /api/v1/rate-shop/rank
        </div>
        <div>
          <span className="font-medium">Origin PIN:</span> {originPincode}
        </div>
      </div>

      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre">
        {embed}
      </pre>

      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(embed).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {copied ? 'Copied!' : 'Copy to Clipboard'}
      </button>
    </div>
  );
}
