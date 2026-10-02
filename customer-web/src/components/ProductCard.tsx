'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/context/cart';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { Button, ProductThumb } from './ui';

export function ProductCard({ product }: { product: Product }) {
  const { lines, add } = useCart();
  const [added, setAdded] = useState(false);
  const inCart = lines.find((l) => l.productId === product.id)?.quantity ?? 0;
  const canAdd = product.inStock && inCart < product.available;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-md">
      <Link href={`/products/${product.id}`} className="block">
        <ProductThumb name={product.name} category={product.category} className="aspect-[4/3] text-3xl" />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{product.category}</p>
        <Link href={`/products/${product.id}`} className="mt-1 font-medium text-slate-900 hover:underline">
          {product.name}
        </Link>
        <p className="mt-1 text-lg font-semibold">{money(product.price)}</p>
        <p className={`mt-1 text-xs ${product.inStock ? (product.available <= 5 ? 'text-amber-600' : 'text-emerald-600') : 'text-rose-600'}`}>
          {product.inStock ? (product.available <= 5 ? `Only ${product.available} left` : 'In stock') : 'Out of stock'}
        </p>
        <Button
          className="mt-4 w-full"
          variant={added ? 'secondary' : 'primary'}
          disabled={!canAdd}
          onClick={() => {
            add(product);
            setAdded(true);
            setTimeout(() => setAdded(false), 1200);
          }}
        >
          {!product.inStock ? 'Out of stock' : !canAdd ? 'Max in cart' : added ? 'Added ✓' : 'Add to cart'}
        </Button>
      </div>
    </article>
  );
}
