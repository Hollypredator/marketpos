import { describe, expect, it } from 'vitest';

import {
  resolveAllowedTabs,
  resolveFallbackTab,
  resolveTabFromPath,
  tabPath,
} from './route-access';

describe('route access matrix', () => {
  it('returns full backoffice tabs for SUPER_ADMIN', () => {
    expect(resolveAllowedTabs('SUPER_ADMIN')).toEqual([
      'organization',
      'catalog',
      'stock',
      'users',
      'reports',
      'subscription',
    ]);
    expect(resolveFallbackTab('SUPER_ADMIN')).toBe('organization');
  });

  it('returns writer tabs for ADMIN', () => {
    expect(resolveAllowedTabs('ADMIN')).toEqual([
      'organization',
      'catalog',
      'stock',
      'users',
      'reports',
    ]);
    expect(resolveFallbackTab('ADMIN')).toBe('organization');
  });

  it('returns reports-only for cashier/accountant roles', () => {
    expect(resolveAllowedTabs('CASHIER')).toEqual(['reports']);
    expect(resolveAllowedTabs('ACCOUNTANT')).toEqual(['reports']);
    expect(resolveFallbackTab('CASHIER')).toBe('reports');
  });

  it('maps tab <-> path consistently', () => {
    expect(tabPath('organization')).toBe('/organization');
    expect(tabPath('subscription')).toBe('/subscription');
    expect(resolveTabFromPath('/stock')).toBe('stock');
    expect(resolveTabFromPath('/unknown')).toBeNull();
  });
});
