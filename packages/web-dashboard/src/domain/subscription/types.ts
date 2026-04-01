import type {
  SubscriptionAuditRow,
  SubscriptionCompanyRow,
  SubscriptionStatus,
  SubscriptionSummary,
} from '../shared/types';

export type { SubscriptionAuditRow, SubscriptionCompanyRow, SubscriptionStatus, SubscriptionSummary };

export type SubscriptionSort = 'DUE_ASC' | 'DUE_DESC' | 'NAME_ASC' | 'STATUS';

export interface SubscriptionFilters {
  dueInDays: string;
  search: string;
  status: '' | SubscriptionStatus;
}

export interface SubscriptionPlanForm {
  note: string;
  packageExpiresAt: string;
  packageGraceDays: string;
  packageStartedAt: string;
  packageStatus: 'ACTIVE' | 'SUSPENDED';
}

export interface ProvisionTemplateSummary {
  categoryCount: number;
  code: string;
  defaultMinStock: number;
  defaultOpeningStock: number;
  displayName: string;
  productCount: number;
}

export interface SubscriptionProvisionForm {
  address: string;
  adminFullName: string;
  adminPassword: string;
  adminUsername: string;
  branchName: string;
  companyId: string;
  companyName: string;
  email: string;
  graceDays: string;
  overwriteStock: boolean;
  packageDays: string;
  phone: string;
  registerName: string;
  taxNumber: string;
  templateCode: string;
}

export interface ProvisionCompanyResult {
  branch: { id: string; name: string };
  company: { id: string; name: string };
  register: { id: string; name: string };
  stats: {
    categoriesCreatedOrUpdated: number;
    productsCreated: number;
    productsUpdated: number;
    stockCreated: number;
    stockUpdated: number;
  };
  template: {
    code: string;
    displayName: string;
  };
}
