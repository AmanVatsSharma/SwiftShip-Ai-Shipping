import * as React from 'react';

/**
 * SS-026 — small SVG icons for the 5 supported e-commerce platforms.
 * Hand-rolled inline so the admin portal doesn't depend on an icon
 * package. Each icon takes the platform's brand color when one is
 * recognised; falls back to slate for unknown platforms.
 */
export type PlatformKey = 'shopify' | 'woocommerce' | 'amazon' | 'flipkart' | 'myntra';

const BRAND: Record<PlatformKey, string> = {
  shopify: '#95BF47',
  woocommerce: '#7F54B3',
  amazon: '#FF9900',
  flipkart: '#2874F0',
  myntra: '#FF3F6C',
};

interface Props {
  platform: string;
  size?: number;
  className?: string;
}

export function PlatformLogo({ platform, size = 24, className }: Props) {
  const key = (['shopify', 'woocommerce', 'amazon', 'flipkart', 'myntra'] as const).find(
    (k) => k === platform.toLowerCase(),
  );
  const color = key ? BRAND[key] : '#64748b';
  const label = key ? labelFor(key) : platform;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={['inline-flex items-center justify-center rounded-md', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, background: `${color}22`, color }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        fill={color}
        aria-hidden="true"
      >
        {glyphFor(key ?? null)}
      </svg>
    </span>
  );
}

function labelFor(key: PlatformKey): string {
  return {
    shopify: 'Shopify',
    woocommerce: 'WooCommerce',
    amazon: 'Amazon',
    flipkart: 'Flipkart',
    myntra: 'Myntra',
  }[key];
}

function glyphFor(key: PlatformKey | null): React.ReactNode {
  switch (key) {
    case 'shopify':
      return (
        <path d="M15.6 4.4c-.1 0-1.6.5-1.7.5-.1-.2-.4-.7-.6-1-.5-.5-1.2-.7-1.9-.5l-1 .3c0-.1 0-.2-.1-.3-.2-.6-.7-1.1-1.5-1.2-1.4-.1-2.8 1.1-3.7 2.6-.6 1-.9 2-.9 2.8 0 .1 0 .2.1.3-1.1.3-1.7.6-1.8.6-.4.1-.4.2-.4.5l-.1.6v11.4c0 .3.1.5.5.5l12.6-1.9c.4-.1.5-.3.5-.5V4.9c0-.3-.1-.4-.5-.4zM13 5.8l-1.3.4c0-.1 0-.2-.1-.3-.1-.4-.3-.7-.6-.8.6-.2 1.3-.3 1.7-.4.1.3.2.7.3 1.1zm-2.3-1c.4.1.6.4.7.7l-1.7.5c.2-.5.6-.9 1-1.2zm-.4 6.1c-.3.6-.7.6-1.2.5-.3-.1-.7-.2-1-.2-.3 0-.8.2-1 .5-.2.3-.1.7.2 1 .3.3.9.3 1.1.1.2-.1.3-.4.4-.6.1-.3.3-.5.6-.4.3.1.4.4.4.7-.1.5-.4.9-.8 1.1-.5.2-1.2.2-1.7-.1-.5-.3-.8-.9-.7-1.5.1-.7.5-1.3 1.1-1.6.5-.3 1.2-.4 1.7-.3.5.1.9.4 1 .9z" />
      );
    case 'woocommerce':
      return (
        <path d="M2 5h2l1.5 7 2-7h2l2 7 1.5-7h2l-2.5 11h-2l-2-7-2 7h-2L2 5zm16 6a2 2 0 0 1 4 0v3a2 2 0 1 1-4 0v-3zm1 0v3a1 1 0 1 0 2 0v-3a1 1 0 1 0-2 0z" />
      );
    case 'amazon':
      return (
        <path d="M12 4c-4.4 0-8 3.6-8 8s3.6 8 8 8c3 0 5.5-1.6 6.9-4l-1.5-.9c-1 1.8-3 3-5.4 3a6 6 0 1 1 0-12c2.4 0 4.4 1.2 5.4 3l1.5-.9C17.5 5.6 15 4 12 4zm.5 4v3l2.5 1.5-.5.8-3-1.7V8h1z" />
      );
    case 'flipkart':
      return (
        <path d="M3 6h11l-2 5h2l4-7H3v2zm0 4h11l-1 2H3v-2zm0 4h11l-1 2H3v-2zm14 0h4l-2 4-4-2v-2h2z" />
      );
    case 'myntra':
      return (
        <path d="M4 4l8 8 8-8v6l-5 5-3-3-3 3-5-5V4z" />
      );
    default:
      return (
        <circle cx="12" cy="12" r="6" />
      );
  }
}