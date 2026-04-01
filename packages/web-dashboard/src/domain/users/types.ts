import type { User, UserRole } from '../shared/types';

export type { User, UserRole };

export interface UserCreateForm {
  branchId: string;
  fullName: string;
  password: string;
  pin: string;
  role: UserRole;
  username: string;
}

export interface UserEditForm {
  branchId: string;
  fullName: string;
  isActive: boolean;
  password: string;
  pin: string;
  role: UserRole;
  username: string;
}
