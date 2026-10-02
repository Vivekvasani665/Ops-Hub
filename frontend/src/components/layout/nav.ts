import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  ShoppingCart,
  Tags,
  TicketPercent,
  UserCog,
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

/** The store-admin essentials, in the order merchants use them. */
export const NAV_MAIN: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:read' },
  { to: '/products', label: 'Products', icon: Package, permission: 'products:read' },
  { to: '/orders', label: 'Orders', icon: ShoppingCart, permission: 'orders:read' },
  { to: '/customers', label: 'Customers', icon: Users, permission: 'customers:read' },
  { to: '/categories', label: 'Categories', icon: Tags, permission: 'products:read' },
  { to: '/coupons', label: 'Coupons', icon: TicketPercent, permission: 'coupons:read' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Operations and platform tooling. */
export const NAV_MORE: { title: string; items: NavItem[] } = {
  title: 'Operations',
  items: [
    { to: '/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory:read' },
    { to: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'dashboard:read' },
    { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText, permission: 'audit:read' },
    { to: '/jobs', label: 'Background Jobs', icon: Activity, permission: 'jobs:read' },
    { to: '/users', label: 'Team', icon: UserCog, permission: 'users:read' },
    { to: '/organization', label: 'Organization', icon: Building2, permission: 'organization:read' },
  ],
};
