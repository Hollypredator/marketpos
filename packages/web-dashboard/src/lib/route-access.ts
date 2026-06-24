export type DashboardTab =
  | 'setup'
  | 'organization'
  | 'catalog'
  | 'stock'
  | 'users'
  | 'reports'
  | 'suppliers'
  | 'subscription';

export const TAB_PATHS: Record<DashboardTab, string> = {
  setup: '/setup',
  organization: '/organization',
  catalog: '/catalog',
  stock: '/stock',
  users: '/users',
  reports: '/reports',
  suppliers: '/suppliers',
  subscription: '/subscription',
};

const PATH_TO_TAB = new Map<string, DashboardTab>(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as DashboardTab]),
);

export function resolveAllowedTabs(role?: string): DashboardTab[] {
  if (role === 'SUPER_ADMIN') {
    return ['setup', 'organization', 'catalog', 'stock', 'users', 'reports', 'suppliers', 'subscription'];
  }
  return [];
}

export function resolveFallbackTab(role?: string): DashboardTab {
  return role === 'SUPER_ADMIN' ? 'setup' : 'setup';
}

export function resolveTabFromPath(pathname: string): DashboardTab | null {
  return PATH_TO_TAB.get(pathname) ?? null;
}

export function tabPath(tab: DashboardTab): string {
  return TAB_PATHS[tab];
}
