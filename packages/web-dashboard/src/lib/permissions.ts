export type DashboardTab =
  | 'pos'
  | 'dashboard'
  | 'setup'
  | 'organization'
  | 'catalog'
  | 'stock'
  | 'transfers'
  | 'users'
  | 'customers'
  | 'sales'
  | 'reports'
  | 'suppliers'
  | 'subscription'
  | 'audit'
  | 'yonetim';

export type Permission =
  | 'access:pos'
  | 'access:dashboard'
  | 'access:setup'
  | 'access:organization'
  | 'access:catalog'
  | 'access:stock'
  | 'access:transfers'
  | 'access:users'
  | 'access:customers'
  | 'access:sales'
  | 'access:reports'
  | 'access:suppliers'
  | 'access:subscription'
  | 'access:audit'
  | 'access:yonetim'
  | 'write:companies'
  | 'write:branches'
  | 'write:users'
  | 'write:products'
  | 'write:stock'
  | 'write:customers'
  | 'write:subscription'
  | 'write:pricing'
  | 'write:invoice-templates'
  | 'export:reports'
  | 'export:subscription';

export const ALL_PERMISSIONS: Permission[] = [
  'access:dashboard',
  'access:setup',
  'access:organization',
  'access:catalog',
  'access:stock',
  'access:transfers',
  'access:users',
  'access:customers',
  'access:sales',
  'access:reports',
  'access:suppliers',
  'access:subscription',
  'access:audit',
  'access:yonetim',
  'write:companies',
  'write:branches',
  'write:users',
  'write:products',
  'write:stock',
  'write:customers',
  'write:subscription',
  'write:pricing',
  'write:invoice-templates',
  'export:reports',
  'export:subscription',
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: [
    'access:pos',
    'access:dashboard',
    'access:setup',
    'access:organization',
    'access:catalog',
    'access:stock',
    'access:transfers',
    'access:users',
    'access:customers',
    'access:sales',
    'access:reports',
    'access:suppliers',
    'access:subscription',
    'access:audit',
    'access:yonetim',
    'write:companies',
    'write:branches',
    'write:users',
    'write:products',
    'write:stock',
    'write:customers',
    'write:subscription',
    'write:pricing',
    'write:invoice-templates',
    'export:reports',
    'export:subscription',
  ],
  ADMIN: [
    'access:pos',
    'access:dashboard',
    'access:catalog',
    'access:stock',
    'access:transfers',
    'access:users',
    'access:customers',
    'access:sales',
    'access:reports',
    'access:organization',
    'write:companies',
    'write:branches',
    'write:users',
    'write:products',
    'write:stock',
    'write:customers',
    'write:invoice-templates',
    'export:reports',
  ],
  ACCOUNTANT: [
    'access:pos',
    'access:dashboard',
    'access:catalog',
    'access:reports',
    'access:sales',
    'export:reports',
  ],
  CASHIER: [
    'access:pos',
  ],
};

export const TAB_PERMISSIONS: Record<string, Permission> = {
  pos: 'access:pos',
  dashboard: 'access:dashboard',
  setup: 'access:setup',
  organization: 'access:organization',
  catalog: 'access:catalog',
  stock: 'access:stock',
  transfers: 'access:transfers',
  users: 'access:users',
  customers: 'access:customers',
  sales: 'access:sales',
  reports: 'access:reports',
  suppliers: 'access:suppliers',
  subscription: 'access:subscription',
  audit: 'access:audit',
  yonetim: 'access:yonetim',
};

export function hasPermission(role: string | undefined, permission: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

export function getRolePermissions(role: string | undefined): Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}
