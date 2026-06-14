// @ts-check
const withPWA = require('@ducanh2912/next-pwa').default;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Nx-style path mapping for monorepo; use `npm run dev` from this app or
  // `nx serve admin-portal` from the repo root.
  transpilePackages: ['@swiftship/shared-ui'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  experimental: {
    // Standalone output for smaller Docker images
    outputStandalone: true,
  },
};

// PWA — SS-034 Phase 1
//
// We commit a hand-written `public/sw.js` for `next dev` and offline
// previews, but in production the `next-pwa` plugin generates a Workbox-
// powered service worker at `/sw.js` and registers it automatically. The
// runtime caching rules below mirror the hand-written SW so behaviour is
// consistent across dev and prod.
const pwaConfig = withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: false, // we want the SW both in dev and prod for testing
  workboxOptions: {
    disable: false,
    navigateFallback: '/',
    navigateFallbackDenylist: [/^\/api/, /^\/graphql/],
    // Long-lived precache for built assets.
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff,woff2}'],
    runtimeCaching: [
      {
        // Stale-while-revalidate for _next bundles & static assets.
        urlPattern: /\/_next\/static\/.+|^.*\/(icons|static)\/.+/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'swiftship-static-v1',
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        // Cache-first for images and fonts.
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico|woff2?)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'swiftship-images-v1',
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
        },
      },
      {
        // Network-first for /api and /graphql (with offline 503 fallback).
        urlPattern: /^\/(api|graphql)\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'swiftship-api-v1',
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
        },
      },
      {
        // Network-first for navigations (HTML pages).
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'swiftship-pages-v1',
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
        },
      },
    ],
  },
});

module.exports = pwaConfig(nextConfig);
