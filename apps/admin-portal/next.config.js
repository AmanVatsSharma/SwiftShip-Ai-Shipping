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

module.exports = nextConfig;
