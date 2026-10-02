import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Square product/category picture with a neutral placeholder when there is none. */
export function Thumb({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  return (
    <span
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-300',
        className,
      )}
    >
      {src ? <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-1/2 w-1/2" />}
    </span>
  );
}
