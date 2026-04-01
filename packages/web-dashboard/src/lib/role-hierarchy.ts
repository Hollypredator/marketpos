import { USER_ROLES, type UserRole } from '../domain/shared/types';

const ROLE_PRIORITY: Record<UserRole, number> = {
  SUPER_ADMIN: 400,
  ADMIN: 300,
  ACCOUNTANT: 200,
  CASHIER: 100,
};

export function canManageRole(actorRole: UserRole | null, targetRole: UserRole): boolean {
  if (!actorRole) {
    return false;
  }
  if (actorRole === 'SUPER_ADMIN') {
    return true;
  }
  return ROLE_PRIORITY[actorRole] > ROLE_PRIORITY[targetRole];
}

export function resolveAssignableRoles(actorRole: UserRole | null): UserRole[] {
  if (!actorRole) {
    return [];
  }
  if (actorRole === 'SUPER_ADMIN') {
    return [...USER_ROLES];
  }
  return USER_ROLES.filter((role) => ROLE_PRIORITY[actorRole] > ROLE_PRIORITY[role]);
}

