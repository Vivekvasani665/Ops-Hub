'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { api, type ProductSort } from '@/lib/api';
import type { PageMeta, Product } from '@/lib/types';
import { ProductCard, ProductGridSkeleton } from '@/components/ProductCard';
import { Alert, Button, EmptyState, cx } from '@/components/ui';

const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'name', label: 'Name: A to Z' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest first' },
];

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under ₹10,000', max: 10_000 },
  { label: '₹10,000 – ₹50,000', min: 10_000, max: 50_000 },
  { label: '₹50,000 – ₹1,00,000', min: 50_000, max: 1_00_000 },
  { label: 'Over ₹1,00,000', min: 1_00_000 },
];

interface Filters {
  search: string;
  categories: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock: boolean;
  sort: ProductSort;
  page: number;
}

function num(v: string | null) {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function FilterPanel({
  filters,
  categories,
  apply,
}: {
  filters: Filters;
  categories: string[];
  apply: (next: Partial<Filters>) => void;
}) {
  const [min, setMin] = useState(filters.minPrice?.toString() ?? '');
  const [max, setMax] = useState(filters.maxPrice?.toString() ?? '');
  useEffect(() => {
    setMin(filters.minPrice?.toString() ?? '');
    setMax(filters.maxPrice?.toString() ?? '');
  }, [filters.minPrice, filters.maxPrice]);

  const toggleCategory = (c: string) =>
    apply({ categories: filters.categories.includes(c) ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] });

  return (
    <div className="space-y-7 text-sm">
      <div>
        <h3 className="mb-3 font-semibold text-fg">Category</h3>
        <ul className="space-y-2.5">
          {categories.map((c) => (
            <li key={c}>
              <label className="flex cursor-pointer items-center gap-2.5 text-fg-2 hover:text-fg">
                <input type="checkbox" checked={filters.categories.includes(c)} onChange={() => toggleCategory(c)} className="size-4 rounded accent-primary" />
                {c}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-3 font-semibold text-fg">Price Range</h3>
        <ul className="space-y-2.5">
          {PRICE_PRESETS.map((p) => {
            const active = filters.minPrice === p.min && filters.maxPrice === p.max;
            return (
              <li key={p.label}>
                <label className="flex cursor-pointer items-center gap-2.5 text-fg-2 hover:text-fg">
                  <input
                    type="radio"
                    name="price"
                    checked={active}
                    onChange={() => apply({ minPrice: p.min, maxPrice: p.max })}
                    className="size-4 accent-primary"
                  />
                  {p.label}
                </label>
              </li>
            );
          })}
        </ul>
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ minPrice: num(min), maxPrice: num(max) });
          }}
        >
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" placeholder="₹ Min" aria-label="Minimum price" className="h-9 w-full rounded-xl border border-line-2 px-2.5 text-sm focus:border-primary focus:outline-none" />
          <span className="text-subtle">–</span>
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" placeholder="₹ Max" aria-label="Maximum price" className="h-9 w-full rounded-xl border border-line-2 px-2.5 text-sm focus:border-primary focus:outline-none" />
          <button type="submit" className="h-9 rounded-xl bg-inverse px-3 text-xs font-semibold text-inverse-fg hover:opacity-90">
            Go
          </button>
        </form>
      </div>

      <div>
        <h3 className="mb-3 font-semibold text-fg">Availability</h3>
        <label className="flex cursor-pointer items-center gap-2.5 text-fg-2 hover:text-fg">
          <input type="checkbox" checked={filters.inStock} onChange={() => apply({ inStock: !filters.inStock })} className="size-4 rounded accent-primary" />
          In stock only
        </label>
      </div>
    </div>
  );
}

export function ProductListing() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: Filters = {
    search: params.get('search') ?? '',
    categories: (params.get('category') ?? '').split(',').filter(Boolean),
    minPrice: num(params.get('minPrice')),
    maxPrice: num(params.get('maxPrice')),
    inStock: params.get('inStock') === 'true',
    sort: (SORTS.find((s) => s.value === params.get('sort'))?.value ?? 'name') as ProductSort,
    page: Math.max(1, Number(params.get('page')) || 1),
  };
  const key = params.toString();

  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    api.categories().then(setCategories, () => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    setError(null);
    api
      .products({
        search: filters.search || undefined,
        categories: filters.categories,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        inStock: filters.inStock,
        sort: filters.sort,
        page: filters.page,
        limit: 24,
      })
      .then(
        (r) => {
          if (cancelled) return;
          setProducts(r.data);
          setMeta(r.meta);
        },
        (err: Error) => !cancelled && setError(err.message),
      );
    return () => {
      cancelled = true;
    };
    // `key` captures every filter in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function apply(next: Partial<Filters>) {
    const f = { ...filters, page: 1, ...next };
    const q = new URLSearchParams();
    if (f.search) q.set('search', f.search);
    if (f.categories.length) q.set('category', f.categories.join(','));
    if (f.minPrice !== undefined) q.set('minPrice', String(f.minPrice));
    if (f.maxPrice !== undefined) q.set('maxPrice', String(f.maxPrice));
    if (f.inStock) q.set('inStock', 'true');
    if (f.sort !== 'name') q.set('sort', f.sort);
    if (f.page > 1) q.set('page', String(f.page));
    router.push(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  const activeCount =
    filters.categories.length + (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) + (filters.inStock ? 1 : 0);
  const clearAll = () => apply({ categories: [], minPrice: undefined, maxPrice: undefined, inStock: false });

  const title = filters.search ? `Results for “${filters.search}”` : filters.categories.length === 1 ? filters.categories[0] : 'All Products';

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-24 rounded-2xl border border-line bg-surface p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold">Filters</h2>
            {activeCount > 0 && (
              <button type="button" onClick={clearAll} className="text-xs font-medium text-primary hover:underline">
                Clear all
              </button>
            )}
          </div>
          <FilterPanel filters={filters} categories={categories} apply={apply} />
        </div>
      </aside>

      <section className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {title} {meta && <span className="text-base font-normal text-subtle">({meta.total})</span>}
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-2 bg-surface px-3 text-sm font-medium lg:hidden"
            >
              <SlidersHorizontal className="size-4" /> Filters
              {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-fg">{activeCount}</span>}
            </button>
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="hidden sm:inline">Sort by:</span>
              <select
                value={filters.sort}
                onChange={(e) => apply({ sort: e.target.value as ProductSort })}
                className="h-10 rounded-xl border border-line-2 bg-surface px-3 text-sm font-medium text-fg focus:border-primary focus:outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {activeCount > 0 && (
          <div className="flex flex-wrap gap-2">
            {filters.categories.map((c) => (
              <button key={c} type="button" onClick={() => apply({ categories: filters.categories.filter((x) => x !== c) })} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-fg hover:bg-primary-soft">
                {c} <X className="size-3" />
              </button>
            ))}
            {(filters.minPrice !== undefined || filters.maxPrice !== undefined) && (
              <button type="button" onClick={() => apply({ minPrice: undefined, maxPrice: undefined })} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-fg hover:bg-primary-soft">
                ₹{(filters.minPrice ?? 0).toLocaleString('en-IN')} – {filters.maxPrice !== undefined ? `₹${filters.maxPrice.toLocaleString('en-IN')}` : 'any'} <X className="size-3" />
              </button>
            )}
            {filters.inStock && (
              <button type="button" onClick={() => apply({ inStock: false })} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-fg hover:bg-primary-soft">
                In stock <X className="size-3" />
              </button>
            )}
          </div>
        )}

        {error ? (
          <Alert>Could not load products: {error}</Alert>
        ) : !products ? (
          <ProductGridSkeleton count={8} />
        ) : products.length === 0 ? (
          <EmptyState
            title="No products found"
            body="Try a different search, category or price range."
            action={
              <Button variant="secondary" onClick={() => router.push(pathname)}>
                Clear all filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            {meta && meta.totalPages > 1 && (
              <nav className="flex items-center justify-center gap-3 pt-4" aria-label="Pagination">
                <Button variant="secondary" disabled={filters.page <= 1} onClick={() => apply({ page: filters.page - 1 })}>
                  Previous
                </Button>
                <span className="text-sm text-muted">
                  Page {meta.page} of {meta.totalPages}
                </span>
                <Button variant="secondary" disabled={filters.page >= meta.totalPages} onClick={() => apply({ page: filters.page + 1 })}>
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </section>

      {/* Mobile filter drawer */}
      <div className={cx('fixed inset-0 z-40 lg:hidden', drawer ? '' : 'pointer-events-none')} aria-hidden={!drawer}>
        <div className={cx('absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity', drawer ? 'opacity-100' : 'opacity-0')} onClick={() => setDrawer(false)} />
        <div
          role="dialog"
          aria-label="Filters"
          className={cx(
            'absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col bg-surface shadow-xl transition-transform',
            drawer ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold">Filters</h2>
            <button type="button" onClick={() => setDrawer(false)} aria-label="Close filters" className="rounded-xl p-1 hover:bg-surface-2">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <FilterPanel filters={filters} categories={categories} apply={apply} />
          </div>
          <div className="flex gap-2 border-t border-line p-4">
            <Button variant="secondary" className="flex-1" onClick={clearAll}>
              Clear
            </Button>
            <Button className="flex-1" onClick={() => setDrawer(false)}>
              Show results
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
