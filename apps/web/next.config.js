/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  transpilePackages: ['@swiftship/shared-ui'],
  experimental: { outputStandalone: true },
};
