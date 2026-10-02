import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductListing } from './ProductListing';
import { ProductGridSkeleton } from '@/components/ProductCard';

export const metadata: Metadata = { title: 'All Products' };

export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <ProductListing />
    </Suspense>
  );
}
