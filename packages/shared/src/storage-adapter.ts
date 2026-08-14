export interface StorageAdapterUser {
  branchId: string | null;
  companyId: string;
  fullName: string;
  id: string;
  isActive?: boolean;
  role: string;
  username: string;
}

export interface StorageAdapterOfflineAuthResult {
  accessToken: string | null;
  refreshToken: string | null;
  registerId: string | null;
  sessionId: string | null;
  user: StorageAdapterUser;
}

export interface StorageAdapterCustomer {
  address: string | null;
  balance: number;
  companyId: string;
  email: string | null;
  fullName: string;
  id: string;
  isActive: boolean;
  loyaltyPoints: number;
  phone: string | null;
  taxNumber: string | null;
  priceTier?: 'RETAIL' | 'WHOLESALE';
}

export interface StorageAdapterProduct {
  barcode: string | null;
  categoryId: string | null;
  companyId: string;
  costPrice: number;
  id: string;
  isActive: boolean;
  name: string;
  priceTierRetail: number;
  priceTierWholesale: number;
  quickAccess: boolean;
  stockCount: number;
  unit: string;
  vatRate: number;
}

export interface StorageAdapterCategory {
  companyId: string;
  id: string;
  isActive: boolean;
  name: string;
}

export interface StorageAdapterSupplier {
  address: string | null;
  companyId: string;
  email: string | null;
  fullName: string;
  id: string;
  isActive: boolean;
  phone: string | null;
  taxNumber: string | null;
}

export interface StorageAdapterDailyReport {
  date: string;
  netSales: number;
  paymentBreakdown: Array<{ method: string; total: number }>;
  refundsCount: number;
  salesCount: number;
  totalRefunds: number;
  totalSales: number;
  totalVat: number;
}

export interface StorageAdapterTopProductRow {
  count: number;
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface StorageAdapterDailyReportSnapshot {
  report: StorageAdapterDailyReport;
  topProducts: StorageAdapterTopProductRow[];
}

export interface IPOSStorageAdapter {
  getCachedCategories(companyId: string): Promise<StorageAdapterCategory[]>;
  getCachedProducts(options: {
    categoryId?: string;
    companyId: string;
    quickAccessOnly?: boolean;
    search?: string;
  }): Promise<StorageAdapterProduct[]>;
  getCachedCustomers(companyId: string, search?: string): Promise<StorageAdapterCustomer[]>;
  getCachedSuppliers(companyId: string): Promise<StorageAdapterSupplier[]>;
  getCachedSession(): Promise<StorageAdapterOfflineAuthResult | null>;
  offlineLogin(payload: { companyId?: string; password: string; username: string }): Promise<StorageAdapterOfflineAuthResult | null>;
  clearSession(): Promise<void>;
  queueSale(payload: { localId?: string; sale: any }): Promise<any>;
  queueRefund(payload: { localId?: string; refund: any }): Promise<any>;
  queueProductOp(payload: { localId?: string; opType: string; payload: unknown }): Promise<any>;
  queueCustomerOp(payload: { localId?: string; opType: string; payload: unknown }): Promise<any>;
  getLocalDailyReport(query: { companyId: string; registerId: string; referenceAt?: string; limit?: number }): Promise<StorageAdapterDailyReportSnapshot>;
  getLocalSetting(key: string, defaultValue?: string): Promise<string | null>;
  setLocalSetting(key: string, value: string): Promise<void>;
  printReceipt(payload: { copyCount?: number; lines: string[] }): Promise<{ success: boolean; message: string }>;
}
