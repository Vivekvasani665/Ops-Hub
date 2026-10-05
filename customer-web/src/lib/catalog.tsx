import {
  Armchair,
  Gamepad2,
  Headphones,
  Laptop,
  Monitor,
  Flower2,
  Package,
  Plug,
  Shirt,
  Smartphone,
  Tablet,
  Watch,
  type LucideIcon,
} from 'lucide-react';

/** Storefront brand shown in the header and footer; override with NEXT_PUBLIC_BRAND_NAME. */
export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || 'ShopNest';
export const TAGLINE = 'Better products. Better life.';

const ICONS: Record<string, LucideIcon> = {
  phones: Smartphone,
  laptops: Laptop,
  audio: Headphones,
  tablets: Tablet,
  wearables: Watch,
  accessories: Plug,
  furniture: Armchair,
  displays: Monitor,
  gaming: Gamepad2,
  "men's wear": Shirt,
  'mens wear': Shirt,
  'ladies wear': Flower2,
  "women's wear": Flower2,
};

export function categoryIcon(category: string): LucideIcon {
  return ICONS[category.trim().toLowerCase()] ?? Package;
}

const TINTS = [
  'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
];

/** Stable tint per category for icon tiles. */
export function categoryTint(category: string) {
  const hash = [...category].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return TINTS[hash % TINTS.length]!;
}

/** Requests a smaller rendition from image CDNs that support it (Unsplash); other URLs are returned as is. */
export function sizedImage(url: string, width: number) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'images.unsplash.com') return url;
    u.searchParams.set('w', String(width));
    return u.toString();
  } catch {
    return url;
  }
}

/** Product shown to represent a category (hero, fashion banner, category tile) when it is in the catalog. */
const SIGNATURE_SKU: Record<string, string> = {
  'ladies wear': 'LW-GOWN-RED',
  "men's wear": 'MW-SUIT-NVY',
};

/** The category's signature product if present, else its first photographed product. */
export function categoryCover<T extends { category: string; sku: string; imageUrl: string | null }>(products: T[], category: string): T | undefined {
  const inCat = products.filter((p) => p.category === category && p.imageUrl);
  const sku = SIGNATURE_SKU[category.trim().toLowerCase()];
  return inCat.find((p) => p.sku === sku) ?? inCat[0];
}
