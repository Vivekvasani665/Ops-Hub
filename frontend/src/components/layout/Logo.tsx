import { ShoppingBag } from 'lucide-react';

/** Brand mark; always rendered on the dark navy surfaces (sidebar, login panel). */
export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
        <ShoppingBag className="h-[18px] w-[18px] text-navy-900" strokeWidth={2.4} />
      </div>
      {!compact && <p className="text-lg font-bold tracking-tight text-white">OpsHub</p>}
    </div>
  );
}
