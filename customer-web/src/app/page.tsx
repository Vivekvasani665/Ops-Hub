import { Suspense } from 'react';
import { Catalog } from './Catalog';
import { PageLoader } from '@/components/ui';

export default function HomePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Catalog />
    </Suspense>
  );
}
