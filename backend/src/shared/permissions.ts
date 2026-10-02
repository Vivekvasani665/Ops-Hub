import type { Role } from './enums';

export const PERMISSIONS = [
  'orders:read',
  'orders:create',
  'orders:update_status',
  'orders:cancel',
  'products:read',
  'products:write',
  'inventory:read',
  'inventory:adjust',
  'audit:read',
  'jobs:read',
  'jobs:retry',
  'users:read',
  'organization:read',
  'dashboard:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: Permission[] = [
  'orders:read',
  'products:read',
  'inventory:read',
  'dashboard:read',
  'organization:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  ORG_ADMIN: PERMISSIONS,
  MANAGER: [
    ...READ_ONLY,
    'orders:create',
    'orders:update_status',
    'orders:cancel',
    'products:write',
    'inventory:adjust',
    'audit:read',
    'jobs:read',
    'users:read',
  ],
  OPERATOR: [...READ_ONLY, 'orders:create', 'orders:update_status'],
  VIEWER: READ_ONLY,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
