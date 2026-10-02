import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/context/auth';
import { CartProvider } from '@/context/cart';
import { Header } from '@/components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Shop', template: '%s · Shop' },
  description: 'Browse products and place orders online.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <AuthProvider>
          <CartProvider>
            <Header />
            <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
            <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-slate-400">
              Prices include taxes. Orders are confirmed by the store after placement.
            </footer>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
