'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronRight, Minus, Plus, ShoppingCart, Zap } from 'lucide-react';
import { useCart } from '@/context/cart';
import { api, ApiError } from '@/lib/api';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { FeatureStrip } from '@/app/Home';
import { ProductCard, StockNote } from '@/components/ProductCard';
import { Alert, Button, EmptyState, PageLoader, ProductImage, cx } from '@/components/ui';

type Tab = 'specs' | 'related';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lines, add } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<Tab>('specs');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setProduct(null);
    setQty(1);
    api.product(id).then((p) => {
      setProduct(p);
      api.products({ categories: [p.category], limit: 9 }).then((r) => setRelated(r.data.filter((x) => x.id !== p.id).slice(0, 4)), () => undefined);
    }, setError);
  }, [id]);

  if (error) {
    return error instanceof ApiError && error.status === 404 ? (
      <EmptyState title="Product not found" action={<Link href="/products" className="text-sm font-medium text-primary underline">Browse products</Link>} />
    ) : (
      <Alert>Could not load product: {error.message}</Alert>
    );
  }
  if (!product) return <PageLoader />;

  const inCart = lines.find((l) => l.productId === product.id)?.quantity ?? 0;
  const remaining = Math.max(0, product.available - inCart);
  const amount = Math.min(qty, remaining);

  const specs: [string, string][] = [
    ['Category', product.category],
    ['SKU', product.sku],
    ['Availability', product.inStock ? `${product.available} in stock` : 'Out of stock'],
    ['Shipping', 'Free delivery'],
    ['Payment', 'UPI, cards, wallets, net banking or cash on delivery'],
  ];

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-fg">Home</Link>
        <ChevronRight className="size-4" />
        <Link href={`/products?category=${encodeURIComponent(product.category)}`} className="hover:text-fg">
          {product.category}
        </Link>
        <ChevronRight className="size-4" />
        <span className="truncate text-fg">{product.name}</span>
      </nav>

      <div className="grid gap-8 rounded-3xl border border-line bg-surface p-4 sm:p-6 md:grid-cols-2 lg:gap-12">
        <div className="overflow-hidden rounded-2xl bg-surface-2">
          <ProductImage src={product.imageUrl} name={product.name} category={product.category} width={1000} className="aspect-square w-full" />
        </div>

        <div className="flex flex-col">
          <p className="text-sm font-medium tracking-wide text-primary uppercase">{product.category}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{product.name}</h1>
          <p className="mt-1 text-sm text-subtle">SKU {product.sku}</p>

          <p className="mt-5 text-3xl font-bold">{money(product.price)}</p>
          <p className="text-xs text-muted">Inclusive of all taxes · Free shipping</p>

          <span
            className={cx(
              'mt-4 w-fit rounded-md px-2.5 py-1 text-xs font-semibold',
              product.inStock ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
            )}
          >
            {product.inStock ? (product.available <= 5 ? `Only ${product.available} left` : 'In Stock') : 'Out of Stock'}
          </span>

          {product.description && <p className="mt-5 leading-relaxed text-fg-2">{product.description}</p>}

          {product.inStock && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-fg-2">Quantity</span>
                <div className="flex items-center rounded-xl ring-1 ring-line-2">
                  <button type="button" aria-label="Decrease quantity" className="p-2.5 text-fg-2 hover:text-fg disabled:text-subtle" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)}>
                    <Minus className="size-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                    {qty}
                  </span>
                  <button type="button" aria-label="Increase quantity" className="p-2.5 text-fg-2 hover:text-fg disabled:text-subtle" disabled={qty >= Math.min(10, remaining)} onClick={() => setQty((q) => q + 1)}>
                    <Plus className="size-4" />
                  </button>
                </div>
                {inCart > 0 && <span className="text-sm text-muted">{inCart} in cart</span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="py-3"
                  disabled={remaining === 0}
                  onClick={() => {
                    add(product, amount);
                    setQty(1);
                    setAdded(true);
                    setTimeout(() => setAdded(false), 1500);
                  }}
                >
                  <ShoppingCart className="size-4" /> {remaining === 0 ? 'All stock in cart' : added ? 'Added to cart' : 'Add to Cart'}
                </Button>
                <Button
                  className="py-3"
                  disabled={remaining === 0 && inCart === 0}
                  onClick={() => {
                    if (remaining > 0) add(product, amount);
                    router.push('/checkout');
                  }}
                >
                  <Zap className="size-4" /> Buy Now
                </Button>
              </div>
            </div>
          )}
          {!product.inStock && <StockNote product={product} className="mt-6 text-sm" />}

          <div className="mt-8 border-t border-line pt-6">
            <FeatureStrip compact />
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-line bg-surface">
        <div className="flex gap-6 border-b border-line px-6" role="tablist">
          {(
            [
              ['specs', 'Specifications'],
              ['related', `Related Products${related.length ? ` (${related.length})` : ''}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cx('-mb-px border-b-2 py-4 text-sm font-semibold', tab === value ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg')}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p-6">
          {tab === 'specs' ? (
            <dl className="divide-y divide-line text-sm">
              {specs.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] gap-4 py-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          ) : related.length === 0 ? (
            <p className="text-sm text-muted">No other products in this category yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
