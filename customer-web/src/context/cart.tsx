'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product } from '@/lib/types';

/** Snapshot for display only; the backend re-prices every line when the order is placed. */
export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  /** display only; may be missing on carts saved before images existed */
  imageUrl?: string | null;
  category?: string;
}

interface CartState {
  lines: CartLine[];
  ready: boolean;
  count: number;
  subtotal: number;
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  /** refresh name/price from the live catalog */
  sync: (products: Product[]) => void;
  clear: () => void;
}

const STORAGE_KEY = 'opshub-cart-v1';
const MAX_QTY = 1000; // backend limit per line
const MAX_LINES = 50; // backend limit per order

const CartContext = createContext<CartState | null>(null);

function readStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.productId === 'string' && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLines(readStorage());
    setReady(true);
    // Keep several tabs in step.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLines(readStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage unavailable (private mode); the cart still works for this tab
    }
  }, [lines, ready]);

  const add = useCallback((product: Product, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l,
        );
      }
      if (prev.length >= MAX_LINES) return prev;
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          quantity,
          imageUrl: product.imageUrl,
          category: product.category,
        },
      ];
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, Math.floor(quantity)) } : l)),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const sync = useCallback((products: Product[]) => {
    const byId = new Map(products.map((p) => [p.id, p]));
    setLines((prev) => {
      const next = prev.map((l) => {
        const p = byId.get(l.productId);
        return p ? { ...l, name: p.name, sku: p.sku, price: p.price, imageUrl: p.imageUrl, category: p.category } : l;
      });
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({
      lines,
      ready,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: lines.reduce((n, l) => n + l.price * l.quantity, 0),
      add,
      setQuantity,
      remove,
      sync,
      clear,
    }),
    [lines, ready, add, setQuantity, remove, sync, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
