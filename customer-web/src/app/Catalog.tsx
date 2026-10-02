'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PageMeta, Product } from '@/lib/types';
import { ProductCard } from '@/components/ProductCard';
import { Alert, Button, EmptyState, Input, PageLoader, cx } from '@/components/ui';

export function Catalog() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const search = params.get('search') ?? '';
  const category = params.get('category') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [query, setQuery] = useState(search);
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setQuery(search), [search]);

  useEffect(() => {
    api.categories().then(setCategories, () => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    setError(null);
    api.products({ search: search || undefined, category: category || undefined, page }).then(
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
  }, [search, category, page]);

  function navigate(next: { search?: string; category?: string; page?: number }) {
    const q = new URLSearchParams();
    const s = next.search ?? search;
    const c = next.category ?? category;
    if (s) q.set('search', s);
    if (c) q.set('category', c);
    if (next.page && next.page > 1) q.set('page', String(next.page));
    router.push(q.size ? `${pathname}?${q}` : pathname);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shop all products</h1>
          {meta && <p className="mt-1 text-sm text-slate-500">{meta.total} product{meta.total === 1 ? '' : 's'}</p>}
        </div>
        <form
          role="search"
          className="flex w-full gap-2 sm:w-80"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ search: query.trim(), page: 1 });
          }}
        >
          <Input type="search" placeholder="Search products" aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      {categories.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {['', ...categories].map((c) => (
            <button
              key={c || 'all'}
              type="button"
              onClick={() => navigate({ category: c, page: 1 })}
              className={cx(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm ring-1 transition-colors',
                c === category ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400',
              )}
            >
              {c || 'All'}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <Alert>Could not load products: {error}</Alert>
      ) : !products ? (
        <PageLoader />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          body={search || category ? 'Try a different search or category.' : 'Check back soon.'}
          action={
            (search || category) && (
              <Button variant="secondary" onClick={() => router.push(pathname)}>
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {meta && meta.totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3 pt-4" aria-label="Pagination">
              <Button variant="secondary" disabled={page <= 1} onClick={() => navigate({ page: page - 1 })}>
                Previous
              </Button>
              <span className="text-sm text-slate-500">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button variant="secondary" disabled={page >= meta.totalPages} onClick={() => navigate({ page: page + 1 })}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
