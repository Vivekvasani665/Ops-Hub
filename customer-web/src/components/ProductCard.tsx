'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { useCart } from '@/context/cart';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { Button, ProductImage, cx } from './ui';

export function StockNote({ product, className }: { product: Product; className?: string }) {
  const low = product.inStock && product.available <= 5;
  return (
    <p className={cx('text-xs font-medium', product.inStock ? (low ? 'text-amber-600' : 'text-emerald-600') : 'text-rose-600', className)}>
      {product.inStock ? (low ? `Only ${product.available} left` : 'In stock') : 'Out of stock'}
    </p>
  );
}

export function ProductCard({ product, buttonVariant = 'primary' }: { product: Product; buttonVariant?: 'primary' | 'dark' }) {
  const { lines, add } = useCart();
  const [added, setAdded] = useState(false);
  const inCart = lines.find((l) => l.productId === product.id)?.quantity ?? 0;
  const canAdd = product.inStock && inCart < product.available;

  return (
    <article className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-lg hover:shadow-slate-200/60">
      <Link href={`/products/${product.id}`} className="block overflow-hidden rounded-xl bg-slate-100">
        <ProductImage
          src={product.imageUrl}
          name={product.name}
          category={product.category}
          width={500}
          className={cx('aspect-square w-full transition-transform duration-300 group-hover:scale-105', !product.inStock && 'opacity-60')}
        />
      </Link>
      <div className="flex flex-1 flex-col px-1 pt-3">
        <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">{product.category}</p>
        <Link href={`/products/${product.id}`} className="mt-0.5 line-clamp-1 text-sm font-semibold text-slate-900 hover:text-blue-600">
          {product.name}
        </Link>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-base font-bold text-slate-900">{money(product.price)}</span>
          <StockNote product={product} />
        </div>
        <Button
          className="mt-3 w-full"
          variant={added ? 'secondary' : buttonVariant}
          disabled={!canAdd}
          onClick={() => {
            add(product);
            setAdded(true);
            setTimeout(() => setAdded(false), 1200);
          }}
        >
          {added ? <Check className="size-4" /> : canAdd && <ShoppingCart className="size-4" />}
          {!product.inStock ? 'Out of stock' : !canAdd ? 'Max in cart' : added ? 'Added' : 'Add to Cart'}
        </Button>
      </div>
    </article>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-3">
          <div className="aspect-square rounded-xl bg-slate-100" />
          <div className="mt-3 h-3 w-1/3 rounded bg-slate-100" />
          <div className="mt-2 h-4 w-3/4 rounded bg-slate-100" />
          <div className="mt-3 h-9 rounded-lg bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
