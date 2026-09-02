import { registerAs } from '@nestjs/config';

/**
 * Configuration for the eCommerce integrations module
 */
export const ecommerceIntegrationsConfig = registerAs(
  'ecommerceIntegrations',
  () => ({
    /**
     * Shopify configuration
     */
    shopify: {
      /**
       * API key for Shopify integration
       */
      apiKey: process.env.SHOPIFY_API_KEY,

      /**
       * API secret for Shopify integration
       */
      apiSecret: process.env.SHOPIFY_API_SECRET,

      /**
       * API version to use for Shopify
       */
      apiVersion: '2023-10',

      /**
       * Request timeout in milliseconds
       */
      timeout: parseInt(process.env.SHOPIFY_API_TIMEOUT || '5000', 10),

      /**
       * Rate limit for requests to Shopify API per second
       */
      rateLimit: parseInt(process.env.SHOPIFY_RATE_LIMIT || '2', 10),

      /**
       * Public app URL used for OAuth callback
       */
      appUrl: process.env.SHOPIFY_APP_URL,

      /**
       * OAuth scopes (comma-separated)
       */
      scopes: process.env.SHOPIFY_SCOPES || 'read_orders,write_orders',
    },

    /**
     * WooCommerce configuration (for future use)
     */
    wooCommerce: {
      apiVersion: 'v3',
    },

    /**
     * Magento configuration (for future use)
     */
    magento: {
      apiVersion: 'V1',
    },

    /**
     * BigCommerce configuration (for future use)
     */
    bigCommerce: {
      apiVersion: 'v3',
    },
  }),
);
