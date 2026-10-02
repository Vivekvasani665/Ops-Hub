import { Outlet } from 'react-router';
import { useRealtime } from '@/hooks/useRealtime';
import { CreateOrderDialog } from '@/components/orders/CreateOrderDialog';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout() {
  useRealtime(true);
  return (
    <div className="min-h-screen bg-page">
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-[244px]">
        <Header />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-6">
          <Outlet />
        </main>
      </div>
      <CreateOrderDialog />
    </div>
  );
}
