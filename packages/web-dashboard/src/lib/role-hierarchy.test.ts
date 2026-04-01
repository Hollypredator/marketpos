import { describe, expect, it } from 'vitest';

import { canManageRole, resolveAssignableRoles } from './role-hierarchy';

describe('user role hierarchy', () => {
  it('returns full assignable roles for SUPER_ADMIN', () => {
    expect(resolveAssignableRoles('SUPER_ADMIN')).toEqual([
      'SUPER_ADMIN',
      'ADMIN',
      'CASHIER',
      'ACCOUNTANT',
    ]);
  });

  it('returns strict lower roles for ADMIN', () => {
    expect(resolveAssignableRoles('ADMIN')).toEqual(['CASHIER', 'ACCOUNTANT']);
    expect(canManageRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageRole('ADMIN', 'CASHIER')).toBe(true);
  });

  it('blocks management when actor role is unknown', () => {
    expect(resolveAssignableRoles(null)).toEqual([]);
    expect(canManageRole(null, 'CASHIER')).toBe(false);
  });
});

