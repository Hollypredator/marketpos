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
      'audit',
      'yonetim',
    ]);
    expect(resolveFallbackTab('SUPER_ADMIN')).toBe('dashboard');
  });

  it('returns restricted tabs for ADMIN', () => {
    const tabs = resolveAllowedTabs('ADMIN');
    expect(tabs).toContain('dashboard');
    expect(tabs).toContain('catalog');
    expect(tabs).toContain('organization');
    expect(tabs).not.toContain('subscription');
    expect(tabs).not.toContain('audit');
    expect(tabs).not.toContain('yonetim');
    expect(resolveFallbackTab('ADMIN')).toBe('dashboard');
  });

  it('returns restricted tabs for ACCOUNTANT', () => {
    const tabs = resolveAllowedTabs('ACCOUNTANT');
    expect(tabs).toContain('dashboard');
    expect(tabs).toContain('catalog');
    expect(tabs).toContain('sales');
    expect(tabs).toContain('reports');
    expect(tabs).not.toContain('stock');
    expect(tabs).not.toContain('users');
    expect(tabs).not.toContain('setup');
    expect(resolveFallbackTab('ACCOUNTANT')).toBe('dashboard');
  });

  it('returns empty tabs for CASHIER in web dashboard', () => {
    const tabs = resolveAllowedTabs('CASHIER');
    expect(tabs).toEqual([]);
  });

  it('maps tab <-> path consistently', () => {
    expect(tabPath('setup')).toBe('/setup');
    expect(tabPath('organization')).toBe('/organization');
    expect(tabPath('subscription')).toBe('/subscription');
    expect(tabPath('audit')).toBe('/audit');
    expect(resolveTabFromPath('/stock')).toBe('stock');
    expect(resolveTabFromPath('/unknown')).toBeNull();
  });
});
