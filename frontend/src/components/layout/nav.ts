import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  FileText,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
}

export const NAV_TOP: NavItem = { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard };

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operations',
    items: [
      { to: '/orders', label: 'Orders', icon: FileText, permission: 'orders:read' },
      { to: '/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory:read' },
      { to: '/products', label: 'Products', icon: Package, permission: 'products:read' },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText, permission: 'audit:read' },
      { to: '/jobs', label: 'Background Jobs', icon: Activity, permission: 'jobs:read' },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'dashboard:read' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: Users, permission: 'users:read' },
      { to: '/organization', label: 'Organization', icon: Building2, permission: 'organization:read' },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];
