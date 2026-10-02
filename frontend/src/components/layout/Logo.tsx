import { Box } from 'lucide-react';

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-900/40">
        <Box className="h-5 w-5 text-white" strokeWidth={2.2} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="text-lg font-bold tracking-tight text-white">OpsHub</p>
          <p className="text-[11px] text-slate-300/80">Order &amp; Operations Platform</p>
        </div>
      )}
    </div>
  );
}
