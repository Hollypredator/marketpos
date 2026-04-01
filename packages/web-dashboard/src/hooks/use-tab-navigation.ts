import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  resolveAllowedTabs,
  resolveFallbackTab,
  resolveTabFromPath,
  tabPath,
  type DashboardTab,
} from '../lib/route-access';

interface UseTabNavigationResult {
  activeTab: DashboardTab;
  allowedTabs: DashboardTab[];
  fallbackTab: DashboardTab;
  moveToTab: (nextTab: DashboardTab) => void;
}

export function useTabNavigation(
  role: string | undefined,
  isAuthenticated: boolean,
): UseTabNavigationResult {
  const location = useLocation();
  const navigate = useNavigate();

  const allowedTabs = useMemo(() => resolveAllowedTabs(role), [role]);
  const fallbackTab = useMemo(() => resolveFallbackTab(role), [role]);
  const routeTab = useMemo(
    () => resolveTabFromPath(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    if (!routeTab || !allowedTabs.includes(routeTab)) {
      navigate(tabPath(fallbackTab), { replace: true });
    }
  }, [allowedTabs, fallbackTab, isAuthenticated, navigate, routeTab]);

  const moveToTab = useCallback(
    (nextTab: DashboardTab) => {
      if (!allowedTabs.includes(nextTab)) {
        return;
      }
      navigate(tabPath(nextTab));
    },
    [allowedTabs, navigate],
  );

  return {
    activeTab: routeTab && allowedTabs.includes(routeTab) ? routeTab : fallbackTab,
    allowedTabs,
    fallbackTab,
    moveToTab,
  };
}

