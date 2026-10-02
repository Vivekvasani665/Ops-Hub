'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Banknote, ChevronLeft, ChevronRight, MapPinned, ShieldCheck, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { categoryIcon, categoryTint, sizedImage } from '@/lib/catalog';
import type { Product } from '@/lib/types';
import { ProductCard, ProductGridSkeleton } from '@/components/ProductCard';
import { cx } from '@/components/ui';

/** Hero copy per category; a slide only shows when the catalog has a photographed product in it. */
const SLIDES = [
  { category: 'Audio', title: ['Premium Audio', 'For a Better You'], body: 'Discover high-quality headphones with immersive sound and noise cancellation.' },
  { category: 'Laptops', title: ['Power Meets', 'Portability'], body: 'Ultrabooks and pro laptops built for work, study and everything in between.' },
  { category: 'Phones', title: ['The Latest', 'Smartphones'], body: 'Flagship cameras, brilliant displays and all-day battery life.' },
  { category: 'Wearables', title: ['Smarter Every', 'Single Day'], body: 'Track your health and stay connected with the latest wearables.' },
];

const PROMO_IMAGE = 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=80&auto=format&fit=crop';

function Hero({ products }: { products: Product[] | null }) {
  const slides = useMemo(() => {
    if (!products) return [];
    return SLIDES.flatMap((s) => {
      const p = products.find((x) => x.category === s.category && x.imageUrl);
      return p ? [{ ...s, image: p.imageUrl!, product: p }] : [];
    });
  }, [products]);
  const [index, setIndex] = useState(0);
  const count = slides.length;

  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(t);
  }, [count]);

  if (!products) return <div className="aspect-[16/10] animate-pulse rounded-3xl bg-slate-200 sm:aspect-[21/8]" />;

  const slide = slides[index % Math.max(1, count)];
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white" aria-roledescription="carousel">
      <div className="grid min-h-[340px] items-center gap-6 px-6 py-10 sm:px-12 md:grid-cols-2 md:py-12 lg:min-h-[400px]">
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {slide ? (
              <>
                {slide.title[0]}
                <br />
                {slide.title[1]}
              </>
            ) : (
              'Shop the latest tech'
            )}
          </h1>
          <p className="mt-4 text-sm text-slate-300 sm:text-base">
            {slide?.body ?? 'Phones, laptops, audio and more — delivered free, paid your way.'}
          </p>
          <Link
            href={slide ? `/products?category=${encodeURIComponent(slide.category)}` : '/products'}
            className="mt-7 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500"
          >
            Shop Now <ArrowRight className="size-4" />
          </Link>
        </div>
        {slide && (
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-6 rounded-full bg-blue-500/20 blur-3xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={slide.image}
              src={sizedImage(slide.image, 900)}
              alt={slide.product.name}
              className="relative aspect-[4/3] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/10"
            />
          </div>
        )}
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 backdrop-blur hover:bg-white/20 sm:block"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 backdrop-blur hover:bg-white/20 sm:block"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.category}
                type="button"
                aria-label={`Show ${s.category}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40')}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const FEATURES = [
  { icon: Truck, title: 'Free Shipping', body: 'On every order' },
  { icon: ShieldCheck, title: 'Secure Payment', body: 'UPI, cards & wallets' },
  { icon: Banknote, title: 'Cash on Delivery', body: 'Pay when it arrives' },
  { icon: MapPinned, title: 'Order Tracking', body: 'Follow every step' },
];

export function FeatureStrip({ compact = false }: { compact?: boolean }) {
  return (
    <section className={cx('grid grid-cols-2 gap-3', compact ? 'gap-y-4' : 'rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 lg:grid-cols-4')}>
      {FEATURES.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Icon className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">{title}</span>
            <span className="block text-xs text-slate-500">{body}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
          View All <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

export function Home() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<string[] | null>(null);

  useEffect(() => {
    api.products({ limit: 60 }).then((r) => setProducts(r.data), () => setProducts([]));
    api.categories().then(setCategories, () => setCategories([]));
  }, []);

  // In stock first, photographed first, then a stable order.
  const featured = useMemo(
    () =>
      products
        ? [...products]
            .sort((a, b) => Number(b.inStock) - Number(a.inStock) || Number(!!b.imageUrl) - Number(!!a.imageUrl) || b.price - a.price)
            .slice(0, 8)
        : null,
    [products],
  );

  return (
    <div className="space-y-10 sm:space-y-12">
      <Hero products={products} />
      <FeatureStrip />

      <section>
        <SectionHeader title="Featured Products" href="/products" />
        {!featured ? (
          <ProductGridSkeleton count={4} />
        ) : featured.length === 0 ? (
          <p className="text-sm text-slate-500">New products are coming soon.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} buttonVariant="dark" />
            ))}
          </div>
        )}
      </section>

      {categories && categories.length > 0 && (
        <section id="categories" className="scroll-mt-24">
          <SectionHeader title="Shop by Category" href="/products" />
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 lg:grid-cols-8">
            {categories.map((c) => {
              const Icon = categoryIcon(c);
              return (
                <Link key={c} href={`/products?category=${encodeURIComponent(c)}`} className="group flex w-20 shrink-0 flex-col items-center gap-2 sm:w-auto">
                  <span className={cx('flex size-16 items-center justify-center rounded-full ring-1 ring-slate-200 transition-transform group-hover:-translate-y-0.5 sm:size-20', categoryTint(c))}>
                    <Icon className="size-7 sm:size-8" strokeWidth={1.5} />
                  </span>
                  <span className="text-center text-xs font-medium text-slate-700 group-hover:text-blue-600 sm:text-sm">{c}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-300 via-amber-200 to-orange-200">
        <div className="grid items-center md:grid-cols-2">
          <div className="relative z-10 p-8 sm:p-12">
            <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Shop Smart,
              <br />
              Pay Your Way
            </h2>
            <p className="mt-3 max-w-sm text-sm text-slate-800">UPI, cards, wallets or cash on delivery — with free shipping on every order.</p>
            <Link href="/products" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              Shop Now <ArrowRight className="size-4" />
            </Link>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PROMO_IMAGE} alt="Shopper carrying shopping bags" loading="lazy" className="h-56 w-full object-cover md:h-full md:max-h-80" />
        </div>
      </section>
    </div>
  );
}
