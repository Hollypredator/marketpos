export const USER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT'] as const;
export const SUBSCRIPTION_STATUSES = [
  'ACTIVE',
  'GRACE',
  'EXPIRED',
  'SUSPENDED',
  'UNCONFIGURED',
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationMeta {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
  success: boolean;
}

export interface ApiErrorModel {
  status: number;
  message: string;
  errorCode: string | null;
  data: unknown;
}

export interface AuthUser {
  id: string;
  email?: string | null;
  username: string;
  fullName: string;
  role: UserRole;
  companyId: string;
  branchId?: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface Company {
  id: string;
  name: string;
  taxNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  maxItemDiscountPercent: number;
  maxCartDiscountPercent: number;
  isActive: boolean;
  packageType: 'MONTHLY' | 'YEARLY';
  packageStatus: 'ACTIVE' | 'SUSPENDED';
  packageGraceDays: number;
  packageStartedAt?: string | null;
  packageExpiresAt?: string | null;
  packageGraceEndsAt?: string | null;
  licenseKey?: string | null;
  licenseKeyActivatedAt?: string | null;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
}

export interface Register {
  id: string;
  branchId: string;
  name: string;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  color?: string | null;
  companyId?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  brand?: string | null;
  supplierId?: string | null;
  salePrice: number;
  wholesalePrice?: number | null;
  purchasePrice: number;
  vatRate: number;
  minStock: number;
  expiryDate?: string | null;
  categoryId: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface InvoiceTemplateConfig {
  headerText?: string | null;
  footerNote?: string | null;
  logoUrl?: string | null;
  taxOffice?: string | null;
  tradeRegistryNo?: string | null;
  sales?: { label?: string | null; headerText?: string | null; footerNote?: string | null };
  purchase?: { label?: string | null; headerText?: string | null; footerNote?: string | null };
  dispatch?: { label?: string | null; headerText?: string | null; footerNote?: string | null };
}

export interface LedgerSummary {
  openingBalance: number;
  totalDebt: number;
  totalPayment: number;
  closingBalance: number;
  dueAmount: number;
  last30DaysPayments: number;
  netChange: number;
  from: string;
  to: string;
}

export interface StockLevel {
  id: string;
  quantity: number;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    barcode: string;
    minStock: number;
  };
}

export interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reference?: string | null;
  note?: string | null;
  createdAt: string;
  product: { name: string; barcode: string };
  user: { fullName: string };
}

export interface User {
  id: string;
  companyId: string;
  branchId?: string | null;
  email?: string | null;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface DailyReport {
  date: string;
  salesCount: number;
  refundsCount: number;
  totalSales: number;
  totalRefunds: number;
  netSales: number;
  totalVat: number;
  paymentBreakdown: Array<{ method: string; total: number }>;
}

export interface TopProduct {
  productId: string;
  productName: string;
  count: number;
  totalQuantity: number;
  totalRevenue: number;
}

export interface ProfitabilityReport {
  summary: {
    margin: number;
    totalCost: number;
    totalProfit: number;
    totalRevenue: number;
  };
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
}

export interface ExpiringProduct {
  barcode: string;
  categoryName?: string;
  expiryDate?: string;
  id: string;
  name: string;
  stockQuantity: number;
}

export interface ReportSession {
  id: string;
  status: string;
  openingBalance: number;
  totalCashSales?: number;
  totalCardSales?: number;
  totalRefunds?: number;
  closingBalance?: number | null;
  expectedBalance?: number | null;
  difference?: number | null;
  createdAt: string;
  closedAt?: string | null;
  register: { name: string };
  user: { fullName: string };
}

export interface BranchComparisonRow {
  branchId: string;
  branchName: string;
  salesCount: number;
  refundsCount: number;
  totalSales: number;
  totalRefunds: number;
  totalVat: number;
  netSales: number;
}

export interface OperationsHealthResponse {
  company: { id: string; name: string };
  generatedAt: string;
  summary: {
    accepted24hTotal?: number;
    branchCount: number;
    degradedRegisters?: number;
    failed24hTotal?: number;
    registerCount: number;
    onlineRegisters: number;
    offlineRegisters: number;
    oldestPendingAgeSecMax?: number | null;
    pendingQueueTotal: number;
    queuePeakMax?: number;
    replayRate24h?: number;
    replayed24hTotal?: number;
    failedQueueTotal: number;
    lastSyncAt: string | null;
    staleHeartbeatRegisters?: number;
  };
  branches: Array<{
    id: string;
    name: string;
    onlineRegisters: number;
    offlineRegisters: number;
    pendingQueueTotal: number;
    failedQueueTotal: number;
    lastSyncAt: string | null;
    registers: Array<{
      accepted24h?: number;
      degraded?: boolean;
      failed24h?: number;
      id: string;
      name: string;
      isOnline: boolean;
      lastHeartbeatAt?: string | null;
      lastSyncErrorCode?: string | null;
      lastSyncStatus?: string;
      openSessionUpdatedAt: string | null;
      lastSyncAt: string | null;
      oldestPendingAgeSec?: number | null;
      pendingQueueCount: number;
      failedQueueCount: number;
      queuePeak?: number;
      replayRate24h?: number;
      replayed24h?: number;
      staleHeartbeat?: boolean;
    }>;
  }>;
}

export interface CompanyAccessSnapshot {
  checkedAt: string;
  companyId: string;
  daysRemaining: number | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  isAccessAllowed: boolean;
  offlineAccessGraceDays: number;
  offlineAccessValidUntil: string;
  operatorAction: 'CHECK_PLAN_DATES' | 'CONTACT_SUPPORT' | 'NONE' | 'RENEW_PACKAGE';
  packageGraceDays: number;
  reasonCode:
    | 'ACTIVE_SUBSCRIPTION'
    | 'COMPANY_DISABLED'
    | 'NO_PACKAGE_DATES'
    | 'PACKAGE_EXPIRED'
    | 'PACKAGE_EXPIRED_GRACE'
    | 'PACKAGE_SUSPENDED';
  status: SubscriptionStatus;
  summary: string;
}

export interface SubscriptionCompanyRow {
  company: Company;
  access: CompanyAccessSnapshot;
  lastAuditAt: string | null;
}

export type SubscriptionSummary = Record<SubscriptionStatus, number>;

export interface SubscriptionAuditRow {
  id: string;
  actorType: 'USER' | 'SYSTEM';
  eventType:
    | 'RENEW_QUICK'
    | 'RENEW_MANUAL'
    | 'SUSPEND_MANUAL'
    | 'UNSUSPEND_MANUAL'
    | 'SYSTEM_ENTER_GRACE'
    | 'SYSTEM_BLOCK_EXPIRED'
    | 'SYSTEM_RESTORE_ACTIVE';
  previousStatus: SubscriptionStatus | null;
  nextStatus: SubscriptionStatus;
  note?: string | null;
  createdAt: string;
  actorUser?: {
    id: string;
    username: string;
    fullName: string;
    role: UserRole;
  } | null;
}

export interface PermissionMatrix {
  canWriteBackoffice: boolean;
  isSuperAdmin: boolean;
  role: UserRole;
}
