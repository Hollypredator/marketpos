import { hasPermission, TAB_PERMISSIONS } from './permissions';
import type { DashboardTab } from './permissions';

export type { DashboardTab };

export const TAB_PATHS: Record<DashboardTab, string> = {
  pos: '/pos',
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
  audit: '/audit',
  yonetim: '/yonetim',
};

const PATH_TO_TAB = new Map<string, DashboardTab>(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as DashboardTab]),
);

export function resolveAllowedTabs(role?: string): DashboardTab[] {
  return (Object.keys(TAB_PATHS) as DashboardTab[]).filter((tab) =>
    hasPermission(role, TAB_PERMISSIONS[tab]),
  );
}

export function resolveFallbackTab(_role?: string): DashboardTab {
  return 'dashboard';
}

export function resolveTabFromPath(pathname: string): DashboardTab | null {
  return PATH_TO_TAB.get(pathname) ?? null;
}

export function tabPath(tab: DashboardTab): string {
  return TAB_PATHS[tab];
}
