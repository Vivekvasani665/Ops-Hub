'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Plus, ShoppingCart } from 'lucide-react';
import { useCart } from '@/context/cart';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { Button, ProductImage, cx } from './ui';

export function StockNote({ product, className }: { product: Product; className?: string }) {
  const low = product.inStock && product.available <= 5;
  return (
    <p className={cx('text-xs font-semibold', product.inStock ? (low ? 'text-warning' : 'text-success') : 'text-danger', className)}>
      {product.inStock ? (low ? `Only ${product.available} left` : 'In stock') : 'Out of stock'}
    </p>
  );
}

/** Only what the catalog really knows: stock level. No invented ratings or discounts. */
function StockBadge({ product }: { product: Product }) {
  if (!product.inStock) return <span className="rounded-full bg-inverse/85 px-2.5 py-1 text-[11px] font-semibold text-inverse-fg backdrop-blur">Sold out</span>;
  if (product.available <= 5) return <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning ring-1 ring-warning/25 backdrop-blur">Only {product.available} left</span>;
  return null;
}

export function ProductCard({ product, buttonVariant = 'primary' }: { product: Product; buttonVariant?: 'primary' | 'dark' }) {
  const { lines, add } = useCart();
  const [added, setAdded] = useState(false);
  const inCart = lines.find((l) => l.productId === product.id)?.quantity ?? 0;
  const canAdd = product.inStock && inCart < product.available;

  const addOne = () => {
    add(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-line-2 hover:shadow-xl hover:shadow-black/5">
      <div className="relative">
        <Link href={`/products/${product.id}`} className="block overflow-hidden bg-surface-2">
          <ProductImage
            src={product.imageUrl}
            name={product.name}
            category={product.category}
            width={500}
            className={cx('aspect-square w-full transition-transform duration-500 group-hover:scale-105', !product.inStock && 'opacity-50 grayscale')}
          />
        </Link>
        <div className="pointer-events-none absolute top-3 left-3">
          <StockBadge product={product} />
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={addOne}
            aria-label={`Quick add ${product.name} to cart`}
            className="absolute right-3 bottom-3 hidden size-10 translate-y-2 items-center justify-center rounded-full bg-surface text-fg opacity-0 shadow-lg ring-1 ring-line transition-all group-hover:translate-y-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-fg sm:flex"
          >
            {added ? <Check className="size-4" /> : <Plus className="size-4" />}
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <p className="text-[11px] font-semibold tracking-wider text-primary uppercase">{product.category}</p>
        <Link href={`/products/${product.id}`} className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 font-semibold text-fg hover:text-primary">
          {product.name}
        </Link>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-lg font-bold tracking-tight text-fg tabular-nums">{money(product.price)}</span>
          {product.inStock && product.available > 5 && <span className="text-[11px] font-medium text-success">In stock</span>}
        </div>
        <p className="mt-0.5 text-[11px] text-muted">Free delivery</p>
        <Button className="mt-3 w-full" variant={added ? 'secondary' : buttonVariant} disabled={!canAdd} onClick={addOne}>
          {added ? <Check className="size-4" /> : canAdd && <ShoppingCart className="size-4" />}
          {!product.inStock ? 'Out of stock' : !canAdd ? 'Max in cart' : added ? 'Added to cart' : 'Add to cart'}
        </Button>
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cx('grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="aspect-square bg-surface-2" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-1/3 rounded bg-surface-3" />
            <div className="h-4 w-3/4 rounded bg-surface-3" />
            <div className="h-5 w-1/2 rounded bg-surface-3" />
            <div className="mt-3 h-10 rounded-xl bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
