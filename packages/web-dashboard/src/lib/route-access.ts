export type DashboardTab =
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
  | 'yonetim';

export const TAB_PATHS: Record<DashboardTab, string> = {
  dashboard: '/dashboard',
  setup: '/setup',
  organization: '/organization',
  catalog: '/catalog',
  stock: '/stock',
  transfers: '/transfers',
  users: '/users',
  customers: '/customers',
  sales: '/sales',
  reports: '/reports',
  suppliers: '/suppliers',
  subscription: '/subscription',
  yonetim: '/yonetim',
};

const PATH_TO_TAB = new Map<string, DashboardTab>(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as DashboardTab]),
);

export function resolveAllowedTabs(role?: string): DashboardTab[] {
  if (role === 'SUPER_ADMIN') {
    return ['dashboard', 'setup', 'organization', 'catalog', 'stock', 'transfers', 'users', 'customers', 'sales', 'reports', 'suppliers', 'subscription', 'yonetim'];
  }
  if (role === 'ADMIN') {
    return ['dashboard', 'catalog', 'stock', 'transfers', 'users', 'customers', 'sales', 'reports', 'organization'];
  }
  if (role === 'ACCOUNTANT') {
    return ['dashboard', 'catalog', 'reports', 'sales'];
  }
  if (role === 'CASHIER') {
    return ['dashboard', 'catalog'];
  }
  return ['dashboard'];
}

export function resolveFallbackTab(role?: string): DashboardTab {
  return role === 'SUPER_ADMIN' ? 'dashboard' : 'dashboard';
}

export function resolveTabFromPath(pathname: string): DashboardTab | null {
  return PATH_TO_TAB.get(pathname) ?? null;
}

export function tabPath(tab: DashboardTab): string {
  return TAB_PATHS[tab];
}
