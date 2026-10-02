import {
  Armchair,
  Gamepad2,
  Headphones,
  Laptop,
  Monitor,
  Package,
  Plug,
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
};

export function categoryIcon(category: string): LucideIcon {
  return ICONS[category.trim().toLowerCase()] ?? Package;
}

const TINTS = ['bg-blue-50 text-blue-600', 'bg-violet-50 text-violet-600', 'bg-emerald-50 text-emerald-600', 'bg-amber-50 text-amber-600', 'bg-rose-50 text-rose-600', 'bg-sky-50 text-sky-600'];

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
