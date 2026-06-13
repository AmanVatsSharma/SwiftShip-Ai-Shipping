import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'SwiftShip — Track, ship, scale',
  description: 'AI-powered shipping for Indian D2C brands.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-white text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
