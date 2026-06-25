interface SubscriptionFiltersKey {
  dueInDays: string;
  search: string;
  status: string;
}

interface ProductFiltersKey {
  active: string;
  brand: string;
  categoryId: string;
  maxPrice: string;
  maxPurchasePrice: string;
  minPrice: string;
  minPurchasePrice: string;
  search: string;
  supplierId: string;
  updatedFrom: string;
  updatedTo: string;
  vatRate: string;
}

interface StockMovementFiltersKey {
  dateFrom: string;
  dateTo: string;
  maxQuantity: string;
  minQuantity: string;
  search: string;
  type: string;
  userSearch: string;
}

export const queryKeys = {
  branches: (companyId: string) => ['branches', companyId] as const,
  categories: (companyId: string) => ['categories', companyId] as const,
  companies: ['companies'] as const,
  customers: (companyId: string, page: number, search: string) =>
    ['customers', companyId, page, search] as const,
  customerTransactions: (customerId: string) =>
    ['customer-transactions', customerId] as const,
  invoiceTemplate: (companyId: string) => ['invoice-template', companyId] as const,
  operationsHealth: (role: string, companyId: string, branchId: string) =>
    ['operations-health', role, companyId, branchId] as const,
  products: (companyId: string, filters: ProductFiltersKey) =>
    ['products', companyId, filters] as const,
  refunds: (saleId: string) => ['refunds', saleId] as const,
  registers: (branchId: string) => ['registers', branchId] as const,
  reports: (
    companyId: string,
    branchId: string,
    from: string,
    to: string,
    registerId: string,
    day: string,
  ) => ['reports', companyId, branchId, from, to, registerId, day] as const,
  saleDetail: (saleId: string) => ['sale-detail', saleId] as const,
  sales: (filters: Record<string, unknown>) => ['sales', filters] as const,
  stockLevels: (branchId: string) => ['stock-levels', branchId] as const,
  stockMovements: (branchId: string, filters: StockMovementFiltersKey) =>
    ['stock-movements', branchId, filters] as const,
  stockTransferDetail: (id: string) => ['stock-transfer-detail', id] as const,
  stockTransfers: (filters: Record<string, unknown>) => ['stock-transfers', filters] as const,
  subscriptionAudit: (companyId: string) => ['subscription-audit', companyId] as const,
  subscriptionCompanies: (filters: SubscriptionFiltersKey) =>
    ['subscription-companies', filters] as const,
  subscriptionTemplates: ['subscription-templates'] as const,
  users: (companyId: string) => ['users', companyId] as const,
};
