export type DashboardTab =
  | 'organization'
  | 'catalog'
  | 'stock'
  | 'users'
  | 'reports'
  | 'subscription';

export const TAB_PATHS: Record<DashboardTab, string> = {
  organization: '/organization',
  catalog: '/catalog',
  stock: '/stock',
  users: '/users',
  reports: '/reports',
  subscription: '/subscription',
};

const PATH_TO_TAB = new Map<string, DashboardTab>(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as DashboardTab]),
);

export function resolveAllowedTabs(role?: string): DashboardTab[] {
  if (role === 'SUPER_ADMIN') {
    return ['organization', 'catalog', 'stock', 'users', 'reports', 'subscription'];
  }
  if (role === 'ADMIN') {
    return ['organization', 'catalog', 'stock', 'users', 'reports'];
  }
  return ['reports'];
}

export function resolveFallbackTab(role?: string): DashboardTab {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' ? 'organization' : 'reports';
}

export function resolveTabFromPath(pathname: string): DashboardTab | null {
  return PATH_TO_TAB.get(pathname) ?? null;
}

export function tabPath(tab: DashboardTab): string {
  return TAB_PATHS[tab];
}
