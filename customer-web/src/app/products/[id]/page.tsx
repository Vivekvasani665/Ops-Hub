'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/context/cart';
import { api, ApiError } from '@/lib/api';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { Alert, Button, EmptyState, PageLoader, ProductThumb } from '@/components/ui';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lines, add } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    api.product(id).then(setProduct, setError);
  }, [id]);

  if (error) {
    return error instanceof ApiError && error.status === 404 ? (
      <EmptyState title="Product not found" action={<Link href="/" className="text-sm font-medium underline">Back to shop</Link>} />
    ) : (
      <Alert>Could not load product: {error.message}</Alert>
    );
  }
  if (!product) return <PageLoader />;

  const inCart = lines.find((l) => l.productId === product.id)?.quantity ?? 0;
  const remaining = Math.max(0, product.available - inCart);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to shop
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
        <ProductThumb name={product.name} category={product.category} className="aspect-square rounded-2xl text-6xl" />
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-400">{product.category}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{product.name}</h1>
            <p className="mt-1 text-sm text-slate-500">SKU {product.sku}</p>
          </div>
          <p className="text-3xl font-semibold">{money(product.price)}</p>
          <p className={product.inStock ? 'text-sm text-emerald-700' : 'text-sm text-rose-600'}>
            {product.inStock ? `${product.available} in stock` : 'Currently out of stock'}
          </p>

          {product.inStock && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label htmlFor="qty" className="text-sm font-medium text-slate-700">
                  Quantity
                </label>
                <select
                  id="qty"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  disabled={remaining === 0}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {Array.from({ length: Math.max(1, Math.min(10, remaining)) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                {inCart > 0 && <span className="text-sm text-slate-500">{inCart} already in cart</span>}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={remaining === 0}
                  onClick={() => {
                    add(product, Math.min(qty, remaining));
                    setQty(1);
                  }}
                >
                  {remaining === 0 ? 'All available stock is in your cart' : 'Add to cart'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={remaining === 0 && inCart === 0}
                  onClick={() => {
                    if (remaining > 0) add(product, Math.min(qty, remaining));
                    router.push('/cart');
                  }}
                >
                  Buy now
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
