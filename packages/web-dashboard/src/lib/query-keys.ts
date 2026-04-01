interface SubscriptionFiltersKey {
  dueInDays: string;
  search: string;
  status: string;
}

export const queryKeys = {
  branches: (companyId: string) => ['branches', companyId] as const,
  categories: (companyId: string) => ['categories', companyId] as const,
  companies: ['companies'] as const,
  operationsHealth: (role: string, companyId: string, branchId: string) =>
    ['operations-health', role, companyId, branchId] as const,
  products: (companyId: string) => ['products', companyId] as const,
  registers: (branchId: string) => ['registers', branchId] as const,
  reports: (
    companyId: string,
    branchId: string,
    from: string,
    to: string,
    registerId: string,
    day: string,
  ) => ['reports', companyId, branchId, from, to, registerId, day] as const,
  stockLevels: (branchId: string) => ['stock-levels', branchId] as const,
  stockMovements: (branchId: string) => ['stock-movements', branchId] as const,
  subscriptionAudit: (companyId: string) => ['subscription-audit', companyId] as const,
  subscriptionCompanies: (filters: SubscriptionFiltersKey) =>
    ['subscription-companies', filters] as const,
  subscriptionTemplates: ['subscription-templates'] as const,
  users: (companyId: string) => ['users', companyId] as const,
};
