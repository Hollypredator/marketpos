import type { UserRole } from '@prisma/client';

const ROLE_PRIORITY: Record<UserRole, number> = {
  SUPER_ADMIN: 400,
  ADMIN: 300,
  ACCOUNTANT: 200,
  CASHIER: 100,
};

export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'SUPER_ADMIN') {
    return true;
  }
  return ROLE_PRIORITY[actorRole] > ROLE_PRIORITY[targetRole];
}

export function canAssignRole(actorRole: UserRole, nextRole: UserRole): boolean {
  if (actorRole === 'SUPER_ADMIN') {
    return true;
  }
  return ROLE_PRIORITY[actorRole] > ROLE_PRIORITY[nextRole];
}

