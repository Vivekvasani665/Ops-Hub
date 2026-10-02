import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import type { Permission } from '@/shared';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequirePermission } from '@/components/common/RequirePermission';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Loader2 } from 'lucide-react';

function page(loader: () => Promise<Record<string, ComponentType>>, name: string) {
  return lazy(async () => ({ default: (await loader())[name]! }));
}

const LoginPage = page(() => import('@/pages/LoginPage'), 'LoginPage');
const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage');
const OrdersPage = page(() => import('@/pages/OrdersPage'), 'OrdersPage');
const OrderDetailPage = page(() => import('@/pages/OrderDetailPage'), 'OrderDetailPage');
const InventoryPage = page(() => import('@/pages/InventoryPage'), 'InventoryPage');
const ProductsPage = page(() => import('@/pages/ProductsPage'), 'ProductsPage');
const AuditLogsPage = page(() => import('@/pages/AuditLogsPage'), 'AuditLogsPage');
const JobsPage = page(() => import('@/pages/JobsPage'), 'JobsPage');
const AnalyticsPage = page(() => import('@/pages/AnalyticsPage'), 'AnalyticsPage');
const UsersPage = page(() => import('@/pages/UsersPage'), 'UsersPage');
const OrganizationPage = page(() => import('@/pages/OrganizationPage'), 'OrganizationPage');
const SettingsPage = page(() => import('@/pages/SettingsPage'), 'SettingsPage');
const NotFoundPage = page(() => import('@/pages/NotFoundPage'), 'NotFoundPage');

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
    </div>
  );
}

function guarded(element: ReactNode, permission?: Permission) {
  const content = <Suspense fallback={<PageFallback />}>{element}</Suspense>;
  return permission ? <RequirePermission permission={permission}>{content}</RequirePermission> : content;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<FullPageSpinner />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: guarded(<DashboardPage />, 'dashboard:read') },
      { path: 'orders', element: guarded(<OrdersPage />, 'orders:read') },
      { path: 'orders/:id', element: guarded(<OrderDetailPage />, 'orders:read') },
      { path: 'inventory', element: guarded(<InventoryPage />, 'inventory:read') },
      { path: 'products', element: guarded(<ProductsPage />, 'products:read') },
      { path: 'audit-logs', element: guarded(<AuditLogsPage />, 'audit:read') },
      { path: 'jobs', element: guarded(<JobsPage />, 'jobs:read') },
      { path: 'analytics', element: guarded(<AnalyticsPage />, 'dashboard:read') },
      { path: 'users', element: guarded(<UsersPage />, 'users:read') },
      { path: 'organization', element: guarded(<OrganizationPage />, 'organization:read') },
      { path: 'settings', element: guarded(<SettingsPage />) },
      { path: '*', element: guarded(<NotFoundPage />) },
    ],
  },
]);
