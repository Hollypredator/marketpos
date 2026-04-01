import type { UserRole } from '@prisma/client';

export interface AuthJwtPayload {
  branchId: string | null;
  companyId: string;
  id: string;
  role: UserRole;
  type?: 'refresh';
}
