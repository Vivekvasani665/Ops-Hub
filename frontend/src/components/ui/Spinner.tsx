import { Loader2 } from 'lucide-react';

export function FullPageSpinner() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
    </div>
  );
}
