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
      'dashboard',
      'setup',
      'organization',
      'catalog',
      'stock',
      'transfers',
      'users',
      'customers',
      'sales',
      'reports',
      'suppliers',
      'subscription',
      'yonetim',
    ]);
    expect(resolveFallbackTab('SUPER_ADMIN')).toBe('dashboard');
  });

  it('returns restricted tabs for ADMIN', () => {
    expect(resolveAllowedTabs('ADMIN')).toEqual([
      'dashboard',
      'catalog',
      'stock',
      'transfers',
      'users',
      'customers',
      'sales',
      'reports',
      'organization',
    ]);
    expect(resolveFallbackTab('ADMIN')).toBe('dashboard');
  });

  it('returns restricted tabs for ACCOUNTANT', () => {
    expect(resolveAllowedTabs('ACCOUNTANT')).toEqual([
      'dashboard',
      'catalog',
      'reports',
      'sales',
    ]);
    expect(resolveFallbackTab('ACCOUNTANT')).toBe('dashboard');
  });

  it('returns minimal tabs for CASHIER', () => {
    expect(resolveAllowedTabs('CASHIER')).toEqual([
      'dashboard',
      'catalog',
    ]);
    expect(resolveFallbackTab('CASHIER')).toBe('dashboard');
  });

  it('maps tab <-> path consistently', () => {
    expect(tabPath('setup')).toBe('/setup');
    expect(tabPath('organization')).toBe('/organization');
    expect(tabPath('subscription')).toBe('/subscription');
    expect(resolveTabFromPath('/stock')).toBe('stock');
    expect(resolveTabFromPath('/unknown')).toBeNull();
  });
});
