import type { Branch, Company } from '../shared/types';

export type { Branch, Company };

export interface CompanyCreateForm {
  address: string;
  email: string;
  name: string;
  phone: string;
  taxNumber: string;
}

export interface CompanyEditForm extends CompanyCreateForm {
  isActive: boolean;
}

export interface BranchCreateForm {
  address: string;
  name: string;
  phone: string;
}

export interface BranchEditForm extends BranchCreateForm {
  isActive: boolean;
}
