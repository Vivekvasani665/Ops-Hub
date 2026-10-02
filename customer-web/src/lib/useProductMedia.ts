'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

export interface ProductMedia {
  imageUrl: string | null;
  category: string;
}

/** Photos for products referenced by orders (order lines keep name and price, not media). */
export function useProductMedia(productIds: string[]) {
  const [media, setMedia] = useState<Map<string, ProductMedia>>(new Map());
  const key = [...new Set(productIds)].sort().join(',');

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    api.products({ ids: key.split(',').slice(0, 60) }).then(
      (r) => !cancelled && setMedia(new Map(r.data.map((p) => [p.id, { imageUrl: p.imageUrl, category: p.category }]))),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  return media;
}
