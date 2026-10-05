import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/auth';
import { CartProvider } from '@/context/cart';
import { ThemeProvider, themeBootScript } from '@/context/theme';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { BRAND, TAGLINE } from '@/lib/catalog';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: `${BRAND} — ${TAGLINE}`, template: `%s · ${BRAND}` },
  description: 'Shop phones, laptops, audio and more. Pay with UPI, cards, wallets or cash on delivery.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme / data-accent are set before paint by the boot script, so React must not fight over them.
    <html lang="en" className={inter.variable} data-theme="light" data-accent="blue" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-screen flex-col font-sans">
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <Header />
              <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:py-8">{children}</main>
              <Footer />
              <MobileNav />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
