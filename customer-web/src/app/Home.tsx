'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Banknote, ChevronLeft, ChevronRight, MapPinned, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import { api } from '@/lib/api';
import { categoryCover, categoryIcon, categoryTint, sizedImage } from '@/lib/catalog';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { ProductCard, ProductGridSkeleton } from '@/components/ProductCard';
import { SectionHeader, cx } from '@/components/ui';

/** Hero copy per category; a slide only shows when the catalog has a photographed product in it. */
const SLIDES = [
  { category: 'Ladies Wear', eyebrow: 'New season fashion', title: ['Style That', 'Speaks For You'], body: 'Dresses, sarees, anarkalis and more — fresh looks for every occasion.' },
  { category: "Men's Wear", eyebrow: 'Dress sharp', title: ['Tailored For', 'Every Moment'], body: 'Shirts, suits, denim and jackets that fit your day, from boardroom to weekend.' },
  { category: 'Audio', eyebrow: 'Sound, reimagined', title: ['Premium Audio', 'For a Better You'], body: 'Immersive sound and active noise cancellation, delivered free.' },
  { category: 'Laptops', eyebrow: 'Work from anywhere', title: ['Power Meets', 'Portability'], body: 'Ultrabooks and pro laptops built for work, study and play.' },
  { category: 'Phones', eyebrow: 'Just landed', title: ['The Latest', 'Smartphones'], body: 'Flagship cameras, brilliant displays and all-day battery life.' },
  { category: 'Wearables', eyebrow: 'Stay on track', title: ['Smarter Every', 'Single Day'], body: 'Track your health and stay connected with the latest wearables.' },
];

const PROMO_IMAGE = 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=80&auto=format&fit=crop';

const viewAll = (href: string, label = 'View all') => (
  <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:text-primary-hover">
    {label} <ArrowRight className="size-4" />
  </Link>
);

function Hero({ products }: { products: Product[] | null }) {
  const slides = useMemo(() => {
    if (!products) return [];
    return SLIDES.flatMap((s) => {
      const p = categoryCover(products, s.category);
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

  if (!products) return <div className="min-h-[360px] animate-pulse rounded-3xl bg-surface-3 lg:min-h-[440px]" />;

  const slide = slides[index % Math.max(1, count)];
  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-[radial-gradient(120%_120%_at_0%_0%,#1e293b_0%,#0b1120_55%,#020617_100%)] text-white"
      aria-roledescription="carousel"
    >
      <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-primary/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative grid min-h-[360px] items-center gap-8 px-6 py-10 sm:px-12 md:grid-cols-2 lg:min-h-[440px]">
        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15 backdrop-blur">
            <Sparkles className="size-3.5" /> {slide?.eyebrow ?? 'New season'}
          </span>
          <h1 className="mt-4 text-3xl leading-[1.1] font-extrabold tracking-tight sm:text-4xl lg:text-[2.6rem]">
            {slide ? (
              <>
                {slide.title[0]}
                <br />
                <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">{slide.title[1]}</span>
              </>
            ) : (
              'Shop the latest tech'
            )}
          </h1>
          <p className="mt-4 text-sm text-slate-300 sm:text-base">{slide?.body ?? 'Phones, laptops, audio and more — delivered free, paid your way.'}</p>
          {slide && (
            <p className="mt-5 text-sm text-slate-400">
              {slide.product.name} from <span className="text-lg font-bold text-white">{money(slide.product.price)}</span>
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={slide ? `/products?category=${encodeURIComponent(slide.category)}` : '/products'}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-fg shadow-lg shadow-primary/40 transition hover:bg-primary-hover"
            >
              Shop now <ArrowRight className="size-4" />
            </Link>
            {slide && (
              <Link href={`/products/${slide.product.id}`} className="inline-flex items-center rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/15">
                View product
              </Link>
            )}
          </div>
        </div>
        {slide && (
          <div className="relative mx-auto w-full max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={slide.image}
              src={sizedImage(slide.image, 900)}
              alt={slide.product.name}
              className="relative aspect-[16/10] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/10 md:aspect-[4/3]"
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
            className="absolute right-16 bottom-4 hidden rounded-full bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur hover:bg-white/20 sm:block"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="absolute right-4 bottom-4 hidden rounded-full bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur hover:bg-white/20 sm:block"
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
                className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-7 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60')}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Two promo tiles next to the hero on large screens. */
function SidePromos({ products }: { products: Product[] | null }) {
  const pick = (cat: string) => products?.find((p) => p.category === cat && p.imageUrl) ?? products?.find((p) => p.imageUrl && p.category !== cat);
  const a = pick('Wearables');
  const b = pick('Accessories');
  const tiles = [
    { title: 'New arrivals', body: 'Fresh picks, just in', href: '/products?sort=newest', product: a, tone: 'bg-primary-soft' },
    { title: 'Best value', body: 'Great tech, lower prices', href: '/products?sort=price_asc', product: b, tone: 'bg-surface-2' },
  ];
  return (
    <div className="hidden gap-4 lg:grid lg:grid-rows-2">
      {tiles.map((t) => (
        <Link key={t.title} href={t.href} className={cx('group relative flex overflow-hidden rounded-3xl border border-line p-6', t.tone)}>
          <div className="relative z-10 max-w-[55%]">
            <p className="text-lg font-bold text-fg">{t.title}</p>
            <p className="mt-1 text-sm text-muted">{t.body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Shop now <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
          {t.product?.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sizedImage(t.product.imageUrl, 400)}
              alt=""
              className="absolute -right-4 -bottom-4 size-40 rounded-2xl object-cover shadow-xl transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-2"
            />
          )}
        </Link>
      ))}
    </div>
  );
}

const FEATURES = [
  { icon: Truck, title: 'Free Shipping', body: 'On every order' },
  { icon: ShieldCheck, title: 'Secure Payment', body: 'UPI, cards & net banking' },
  { icon: Banknote, title: 'Cash on Delivery', body: 'Pay when it arrives' },
  { icon: MapPinned, title: 'Order Tracking', body: 'Follow every step' },
];

export function FeatureStrip({ compact = false }: { compact?: boolean }) {
  return (
    <section className={cx('grid grid-cols-2 gap-3', compact ? 'gap-y-4' : 'rounded-2xl border border-line bg-surface p-4 sm:p-5 lg:grid-cols-4')}>
      {FEATURES.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">{title}</span>
            <span className="block text-xs text-muted">{body}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

function CategoryTiles({ categories, products }: { categories: string[]; products: Product[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0 md:grid-cols-4">
      {categories.map((c) => {
        const Icon = categoryIcon(c);
        const photo = categoryCover(products, c)?.imageUrl;
        const n = products.filter((p) => p.category === c).length;
        return (
          <Link
            key={c}
            href={`/products?category=${encodeURIComponent(c)}`}
            className="group w-36 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-black/5 sm:w-auto"
          >
            <div className={cx('relative aspect-[4/3] overflow-hidden', !photo && categoryTint(c))}>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sizedImage(photo, 400)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-110" />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <Icon className="size-10" strokeWidth={1.5} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2.5 p-3">
              <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg', categoryTint(c))}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-fg group-hover:text-primary">{c}</span>
                <span className="block text-[11px] text-muted">
                  {n} product{n === 1 ? '' : 's'}
                </span>
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** Men's / Ladies split banner, shown once the catalog has photographed products in those categories. */
function FashionBanner({ products }: { products: Product[] }) {
  const tiles = [
    { category: "Men's Wear", title: "Men's Wear", body: 'Shirts, suits, denim & jackets' },
    { category: 'Ladies Wear', title: 'Ladies Wear', body: 'Dresses, sarees, anarkalis & more' },
  ].flatMap((t) => {
    const items = products.filter((p) => p.category === t.category && p.imageUrl);
    return items.length ? [{ ...t, image: categoryCover(products, t.category)!.imageUrl!, from: Math.min(...items.map((p) => p.price)), count: items.length }] : [];
  });
  if (!tiles.length) return null;
  return (
    <section>
      <SectionHeader title="Fashion" subtitle="Fresh styles for him and her" />
      <div className="grid gap-4 md:grid-cols-2">
        {tiles.map((t) => (
          <Link
            key={t.category}
            href={`/products?category=${encodeURIComponent(t.category)}`}
            className="group relative flex min-h-64 items-end overflow-hidden rounded-3xl sm:min-h-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sizedImage(t.image, 900)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover object-top transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <div className="relative w-full p-6 text-white sm:p-8">
              <p className="text-xs font-semibold tracking-widest uppercase opacity-80">{t.count} styles · from {money(t.from)}</p>
              <h3 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{t.title}</h3>
              <p className="mt-1 text-sm text-white/80">{t.body}</p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition group-hover:gap-3">
                Shop {t.title} <ArrowRight className="size-4" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Horizontally scrolling product row with arrow buttons on desktop. */
function ProductRail({ products }: { products: Product[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <div className="relative">
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 sm:gap-5">
        {products.map((p) => (
          <div key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%]">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
      {products.length > 4 && (
        <>
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scroll(-1)}
            className="absolute top-1/3 -left-4 hidden size-10 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-lg hover:bg-surface-2 lg:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scroll(1)}
            className="absolute top-1/3 -right-4 hidden size-10 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-lg hover:bg-surface-2 lg:flex"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
    </div>
  );
}

export function Home() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [newest, setNewest] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<string[] | null>(null);

  useEffect(() => {
    api.products({ limit: 60 }).then((r) => setProducts(r.data), () => setProducts([]));
    api.products({ sort: 'newest', limit: 8 }).then((r) => setNewest(r.data), () => setNewest([]));
    api.categories().then(setCategories, () => setCategories([]));
  }, []);

  // In stock first, photographed first, then the premium end of the range.
  const trending = useMemo(
    () =>
      products
        ? [...products]
            .sort((a, b) => Number(b.inStock) - Number(a.inStock) || Number(!!b.imageUrl) - Number(!!a.imageUrl) || b.price - a.price)
            .slice(0, 10)
        : null,
    [products],
  );
  const value = useMemo(() => (products ? [...products].filter((p) => p.inStock).sort((a, b) => a.price - b.price).slice(0, 4) : null), [products]);

  return (
    <div className="space-y-12 sm:space-y-16">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Hero products={products} />
        <SidePromos products={products} />
      </div>

      <FeatureStrip />

      {categories && categories.length > 0 && products && (
        <section id="categories" className="scroll-mt-32">
          <SectionHeader title="Shop by category" subtitle="Find exactly what you are looking for" action={viewAll('/products', 'All products')} />
          <CategoryTiles categories={categories} products={products} />
        </section>
      )}

      {products && <FashionBanner products={products} />}

      <section>
        <SectionHeader title="Trending now" subtitle="Our most popular picks this week" action={viewAll('/products')} />
        {!trending ? (
          <ProductGridSkeleton count={4} />
        ) : trending.length === 0 ? (
          <p className="text-sm text-muted">New products are coming soon.</p>
        ) : (
          <ProductRail products={trending} />
        )}
      </section>

      <section className="relative overflow-hidden rounded-3xl bg-primary text-primary-fg">
        <div className="pointer-events-none absolute -top-20 -left-20 size-72 rounded-full bg-white/15 blur-2xl" />
        <div className="grid items-center md:grid-cols-2">
          <div className="relative z-10 p-8 sm:p-12">
            <p className="text-xs font-bold tracking-widest uppercase opacity-80">Pay your way</p>
            <h2 className="mt-2 text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
              UPI, cards, net banking
              <br />
              or cash on delivery
            </h2>
            <p className="mt-3 max-w-sm text-sm opacity-85">Secure checkout by PayU, and free shipping on every single order.</p>
            <Link href="/products" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg hover:bg-white/90">
              Start shopping <ArrowRight className="size-4" />
            </Link>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PROMO_IMAGE} alt="Shopper carrying shopping bags" loading="lazy" className="h-56 w-full object-cover md:h-full md:max-h-96" />
        </div>
      </section>

      <section>
        <SectionHeader title="New arrivals" subtitle="The latest additions to the store" action={viewAll('/products?sort=newest')} />
        {!newest ? (
          <ProductGridSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {newest.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {value && value.length > 0 && (
        <section>
          <SectionHeader title="Best value" subtitle="Quality tech that is easy on the wallet" action={viewAll('/products?sort=price_asc')} />
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {value.map((p) => (
              <ProductCard key={p.id} product={p} buttonVariant="dark" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
