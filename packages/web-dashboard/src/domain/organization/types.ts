import type { Branch, Company } from '../shared/types';

export type { Branch, Company };

export interface CompanyCreateForm {
  address: string;
  email: string;
  maxCartDiscountPercent: string;
  maxItemDiscountPercent: string;
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

export interface InvoiceTemplateForm {
  footerNote: string;
  headerText: string;
  logoUrl: string;
  taxOffice: string;
  tradeRegistryNo: string;
  salesFooterNote: string;
  salesHeaderText: string;
  salesLabel: string;
  purchaseFooterNote: string;
  purchaseHeaderText: string;
  purchaseLabel: string;
  dispatchFooterNote: string;
  dispatchHeaderText: string;
  dispatchLabel: string;
}
