import type { PendingRefund, PendingSale } from './services/types';
import type {
  CachedUserRecord,
  CachedCategoryRecord,
  CachedProductRecord,
  CachedSupplierRecord,
  CachedPurchaseInvoiceRecord,
  CachedPurchaseInvoiceItemRecord,
  CachedBundleRecord,
  PendingSaleRecord,
  PendingRefundRecord,
  SyncRunResult,
  SyncStatusSummary,
  SyncHealthStatus,
} from '../electron/services/types';

export type {
  CachedUserRecord,
  CachedCategoryRecord,
  CachedProductRecord,
  CachedSupplierRecord,
  CachedPurchaseInvoiceRecord,
  CachedPurchaseInvoiceItemRecord,
  CachedBundleRecord,
  PendingSaleRecord,
  PendingRefundRecord,
  SyncRunResult,
  SyncStatusSummary,
  SyncHealthStatus,
};

export interface CachedCustomerRecord {
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

export interface RuntimeInfo {
  apiBaseUrl: string;
  databasePath: string;
  isPackaged: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncHealthStatus;
  offlineReadinessPassed: boolean;
  pendingCount: number;
  platform: string;
  setupMetrics: SetupMetrics;
  userDataPath: string;
  version: string;
}

export type UiPreset = 'cafe' | 'kasap' | 'market' | 'pide';
export type TouchDensity = 'compact' | 'comfortable';
export type ManagerUnlockMethod = 'PASSWORD' | 'PIN';
export type SetupStepId =
  | 'INSTALL_PREFS'
  | 'LICENSE'
  | 'ACCOUNT'
  | 'MODE_SELECT'
  | 'FINALIZE';
export type SetupStepStatus = 'COMPLETED' | 'PENDING';
export type SetupResultStatus = 'FAILED' | 'SUCCESS';
export type HardwareConnectionMode = 'LAN' | 'USB';
export type CompanyAccessStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'GRACE'
  | 'SUSPENDED'
  | 'UNCONFIGURED';
export type CompanyAccessReasonCode =
  | 'ACTIVE_SUBSCRIPTION'
  | 'COMPANY_DISABLED'
  | 'NO_PACKAGE_DATES'
  | 'PACKAGE_EXPIRED'
  | 'PACKAGE_EXPIRED_GRACE'
  | 'PACKAGE_SUSPENDED';
export type CompanyAccessOperatorAction =
  | 'CHECK_PLAN_DATES'
  | 'CONTACT_SUPPORT'
  | 'NONE'
  | 'RENEW_PACKAGE';
export type HardwareErrorCode =
  | 'NO_LAST_RECEIPT'
  | 'NO_RECEIPT_CONTENT'
  | 'PRINTER_NOT_CONNECTED'
  | 'PRINT_FAILED'
  | 'UNKNOWN';
export type SecurityEventSeverity = 'CRITICAL' | 'INFO' | 'WARN';
export type CashMovementType = 'DROP' | 'PETTY_CASH' | 'SAFE_IN' | 'SAFE_OUT';
export type ProductOpType = 'CREATE' | 'DELETE' | 'UPDATE';
export type StockOpType = 'MOVEMENT';
export type HardwareOperatorAction =
  | 'CHECK_HARDWARE_SETTINGS'
  | 'CHECK_PRINTER_CONNECTION'
  | 'NONE'
  | 'RETRY_PRINT';

export interface UiPresetState {
  touchDensity: TouchDensity;
  uiPreset: UiPreset;
}

export interface SetupStepState {
  completedAt: string | null;
  detail: string | null;
  status: SetupStepStatus;
  stepId: SetupStepId;
}

export interface SetupResultState {
  at: string;
  message: string;
  status: SetupResultStatus;
}

export interface SetupState {
  completedAt: string | null;
  lastResult: SetupResultState | null;
  offlineReadinessPassed: boolean;
  setupMetrics: SetupMetrics;
  setupVersion: number;
  steps: SetupStepState[];
}

export interface SetupMetrics {
  durationMin: number | null;
  firstSaleAt: string | null;
  operatorInterventionCount: number;
  setupStartAt: string;
}

export type SyncHealthStatus = 'DEGRADED' | 'IDLE' | 'OK';

export interface QueueEntityStatusSummary {
  failed: number;
  pending: number;
  queued: number;
  synced: number;
}

export interface SyncStatusSummary {
  customerOps: number;
  lastSyncErrorCode: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncHealthStatus;
  oldestPendingAgeSec: number | null;
  pendingCount: number;
  productOps: number;
  purchaseOps: number;
  queuePeak: number;
  refunds: number;
  sales: number;
  stockOps: number;
  supplierOps: number;
  queueByEntity: {
    customerOps: QueueEntityStatusSummary;
    productOps: QueueEntityStatusSummary;
    purchaseOps: QueueEntityStatusSummary;
    refunds: QueueEntityStatusSummary;
    sales: QueueEntityStatusSummary;
    stockOps: QueueEntityStatusSummary;
    supplierOps: QueueEntityStatusSummary;
  };
}

export interface BackofficeSettings {
  discountPolicy: {
    maxCartDiscountAmount: number;
    maxCartDiscountPercent: number;
    maxItemDiscountAmount: number;
    maxItemDiscountPercent: number;
  };
  offlineAudit: {
    maxPendingProductOps: number;
    maxPendingRefunds: number;
    maxPendingSales: number;
    maxPendingStockOps: number;
  };
  rolePolicy: {
    accountantReadOnly: boolean;
    cashierCanOpenOperations: boolean;
  };
  version: 1;
}

export interface SetupStepUpdatePayload {
  detail?: string | null;
  status: SetupStepStatus;
  stepId: SetupStepId;
}

export interface SetupHealthCheckResult {
  apiBaseUrl: string;
  checks: Array<{ key: 'API_BASE_URL' | 'DATABASE_PATH' | 'ELECTRON_BRIDGE'; ok: boolean; value: string }>;
  databasePath: string;
  passed: boolean;
  userDataPath: string;
  version: string;
}

export interface DrawerPulseConfig {
  off: number;
  on: number;
}

export interface HardwareConfig {
  connectionMode: HardwareConnectionMode;
  copyCount: number;
  drawerPulse: DrawerPulseConfig;
  port: number;
  target: string;
  timeout: number;
}

export interface PendingSaleRecord {
  createdAt: string;
  id: string;
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface PendingRefundRecord {
  createdAt: string;
  id: string;
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface ProductOpQueueRecord {
  createdAt: string;
  id: string;
  opType: ProductOpType;
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface CustomerOpQueueRecord {
  createdAt: string;
  id: string;
  opType: 'CREATE' | 'DELETE' | 'UPDATE';
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface SupplierOpQueueRecord {
  createdAt: string;
  id: string;
  opType: ProductOpType;
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface PurchaseOpQueueRecord {
  createdAt: string;
  id: string;
  opType: ProductOpType;
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface StockOpQueueRecord {
  createdAt: string;
  id: string;
  opType: StockOpType;
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export type LocalReportPaymentMethod =
  | 'CASH'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'ON_ACCOUNT';

export interface LocalReportPaymentBreakdownRow {
  method: LocalReportPaymentMethod;
  total: number;
}

export interface LocalDailyReport {
  date: string;
  netSales: number;
  paymentBreakdown: LocalReportPaymentBreakdownRow[];
  refundsCount: number;
  salesCount: number;
  totalRefunds: number;
  totalSales: number;
  totalVat: number;
}

export interface LocalTopProductReportRow {
  count: number;
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface LocalDailyReportSnapshot {
  report: LocalDailyReport;
  topProducts: LocalTopProductReportRow[];
}

export interface SyncRunOptions {
  accessToken?: string;
  maxPushItems?: number;
  registerId: string;
  sessionId?: string;
}

export interface SyncRunResult {
  errors: string[];
  failedCustomerOpIds: string[];
  failedPurchaseOpIds: string[];
  failedProductOpIds: string[];
  failedRefundIds: string[];
  failedSaleIds: string[];
  failedSupplierOpIds: string[];
  failedStockOpIds: string[];
  nextCursor: string | null;
  pulledCategories: CachedCategoryRecord[];
  pulledProducts: CachedProductRecord[];
  pulledPurchaseInvoiceItems: number;
  pulledUsers: CachedUserRecord[];
  pulledSuppliers: CachedSupplierRecord[];
  pulledCustomers: number;
  pulledPurchaseInvoices: number;
  pulledBundles: number;
  pushedAccepted: number;
  pushedCustomerOpIds: string[];
  pushedCustomerOps: number;
  pushedFailed: number;
  pushedPurchaseOpIds: string[];
  pushedPurchaseOps: number;
  pushedProductOpIds: string[];
  pushedProductOps: number;
  pushedReplayed: number;
  pushedRefundIds: string[];
  pushedRefunds: number;
  pushedSaleIds: string[];
  pushedSales: number;
  pushedStockOpIds: string[];
  pushedStockOps: number;
  pushedSupplierOpIds: string[];
  pushedSupplierOps: number;
  pushSummary: {
    acceptedCount: number;
    errors: string[];
    failedCount: number;
    replayedCount: number;
    serverSyncAt: string;
  };
  resultsByEntity: {
    customerOps: Array<{
      entity: 'customerOps' | 'productOps' | 'purchaseOps' | 'refunds' | 'sales' | 'stockOps' | 'supplierOps';
      error?: string;
      errorCode?: string;
      localId: string;
      operationKey: string;
      status: 'ACCEPTED' | 'FAILED' | 'REPLAYED';
    }>;
    productOps: Array<{
      entity: 'customerOps' | 'productOps' | 'purchaseOps' | 'refunds' | 'sales' | 'stockOps' | 'supplierOps';
      error?: string;
      errorCode?: string;
      localId: string;
      operationKey: string;
      status: 'ACCEPTED' | 'FAILED' | 'REPLAYED';
    }>;
    purchaseOps: Array<{
      entity: 'customerOps' | 'productOps' | 'purchaseOps' | 'refunds' | 'sales' | 'stockOps' | 'supplierOps';
      error?: string;
      errorCode?: string;
      localId: string;
      operationKey: string;
      status: 'ACCEPTED' | 'FAILED' | 'REPLAYED';
    }>;
    refunds: Array<{
      entity: 'customerOps' | 'productOps' | 'purchaseOps' | 'refunds' | 'sales' | 'stockOps' | 'supplierOps';
      error?: string;
      errorCode?: string;
      localId: string;
      operationKey: string;
      status: 'ACCEPTED' | 'FAILED' | 'REPLAYED';
    }>;
    sales: Array<{
      entity: 'customerOps' | 'productOps' | 'purchaseOps' | 'refunds' | 'sales' | 'stockOps' | 'supplierOps';
      error?: string;
      errorCode?: string;
      localId: string;
      operationKey: string;
      status: 'ACCEPTED' | 'FAILED' | 'REPLAYED';
    }>;
    stockOps: Array<{
      entity: 'customerOps' | 'productOps' | 'purchaseOps' | 'refunds' | 'sales' | 'stockOps' | 'supplierOps';
      error?: string;
      errorCode?: string;
      localId: string;
      operationKey: string;
      status: 'ACCEPTED' | 'FAILED' | 'REPLAYED';
    }>;
    supplierOps: Array<{
      entity: 'customerOps' | 'productOps' | 'purchaseOps' | 'refunds' | 'sales' | 'stockOps' | 'supplierOps';
      error?: string;
      errorCode?: string;
      localId: string;
      operationKey: string;
      status: 'ACCEPTED' | 'FAILED' | 'REPLAYED';
    }>;
  };
  remoteProductsTotalActive?: number | null;
  success: boolean;
  syncedAt: string;
  usedCursor: string | null;
}

export interface BackupFileRecord {
  createdAt: string;
  fileName: string;
  path: string;
  sizeBytes: number;
}

export interface BackupRestorePayload {
  fileName: string;
}

export interface BackupPolicy {
  enabled: boolean;
  intervalHours: number;
  lastRunAt: string | null;
  maxBackups: number;
  retentionDays: number;
}

export interface BackupPolicyState extends BackupPolicy {
  nextRunAt: string | null;
}

export interface ListOpsQuery {
  limit?: number;
  registerId?: string;
}

export interface ReceiptPrintPayload {
  copyCount?: number;
  lines: string[];
}

export interface PrinterActionResult {
  errorCode?: HardwareErrorCode;
  interfaceName?: string;
  message: string;
  operatorAction: HardwareOperatorAction;
  printedAt: string;
  success: boolean;
}

export interface CashDrawerOpenOptions {
  operatorId?: string;
  reason?: string;
}

export interface CashDrawerActionResult {
  errorCode?: HardwareErrorCode;
  interfaceName?: string;
  message: string;
  openedAt: string;
  operatorAction: HardwareOperatorAction;
  success: boolean;
}

export interface OfflineAuthResult {
  accessToken: string | null;
  companyAccess: CompanyAccessSnapshot | null;
  refreshToken: string | null;
  registerId: string | null;
  sessionId: string | null;
  user: CachedUserRecord;
}

export interface CompanyAccessSnapshot {
  checkedAt: string;
  companyId: string;
  daysRemaining: number | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  isAccessAllowed: boolean;
  localLastSeenAt?: string | null;
  offlineAccessGraceDays: number;
  offlineAccessValidUntil: string;
  operatorAction: CompanyAccessOperatorAction;
  reasonCode: CompanyAccessReasonCode;
  status: CompanyAccessStatus;
  summary: string;
}

export interface ManagerUnlockResult {
  method: ManagerUnlockMethod;
  requiresPinSetup: boolean;
  user: CachedUserRecord;
}

export interface SecurityEventRecord {
  createdAt: string;
  eventType: string;
  id: string;
  managerUserId: string | null;
  message: string;
  metadataJson: string | null;
  operatorUserId: string | null;
  reason: string | null;
  severity: SecurityEventSeverity;
}

export interface LogSecurityEventPayload {
  eventType: string;
  managerUserId?: string | null;
  message: string;
  metadataJson?: string | null;
  operatorUserId?: string | null;
  reason?: string | null;
  severity: SecurityEventSeverity;
}

export interface ShiftHandoverRecord {
  blindClose: boolean;
  createdAt: string;
  declaredCash: number;
  difference: number;
  expectedCash: number;
  id: string;
  managerUserId: string | null;
  note: string | null;
  operatorUserId: string;
  registerId: string;
}

export interface RecordShiftHandoverPayload {
  blindClose: boolean;
  declaredCash: number;
  expectedCash: number;
  managerUserId?: string | null;
  note?: string | null;
  operatorUserId: string;
  registerId: string;
}

export interface CashMovementRecord {
  amount: number;
  createdAt: string;
  id: string;
  movementType: CashMovementType;
  note: string | null;
  operatorUserId: string;
  registerId: string;
}

export interface RecordCashMovementPayload {
  amount: number;
  movementType: CashMovementType;
  note?: string | null;
  operatorUserId: string;
  registerId: string;
}

export interface ElectronApi {
  ensureInteractive(): Promise<void>;
  getBackofficeSettings(): Promise<BackofficeSettings>;
  setBackofficeSettings(payload: {
    operatorUserId?: string | null;
    patch: Partial<BackofficeSettings>;
  }): Promise<BackofficeSettings>;
  createBackup(): Promise<BackupFileRecord>;
  getBackupPolicy(): Promise<BackupPolicyState>;
  listBackups(): Promise<BackupFileRecord[]>;
  restoreBackup(payload: BackupRestorePayload): Promise<BackupFileRecord>;
  setBackupPolicy(payload: BackupPolicy): Promise<BackupPolicyState>;
  cacheOnlineLogin(payload: {
    accessToken: string;
    companyAccess?: CompanyAccessSnapshot;
    password: string;
    refreshToken: string;
    registerId: string;
    sessionId: string;
    user: CachedUserRecord;
  }): Promise<void>;
  updateCachedAuthTokens(payload: {
    accessToken: string;
    companyAccess?: CompanyAccessSnapshot;
    refreshToken: string;
  }): Promise<void>;
  cacheSyncData(payload: {
    bundles: CachedBundleRecord[];
    categories: CachedCategoryRecord[];
    customers: (Record<string, unknown> & { loyaltyPoints?: number })[];
    products: CachedProductRecord[];
    purchaseInvoices: (CachedPurchaseInvoiceRecord & { items: CachedPurchaseInvoiceItemRecord[] })[];
    suppliers: CachedSupplierRecord[];
    users: CachedUserRecord[];
  }): Promise<void>;

  clearSession(): Promise<void>;
  getCachedCategories(companyId: string): Promise<CachedCategoryRecord[]>;
  getCachedProducts(options: {
    categoryId?: string;
    companyId: string;
    quickAccessOnly?: boolean;
    search?: string;
  }): Promise<CachedProductRecord[]>;
  getCachedSuppliers(companyId: string): Promise<CachedSupplierRecord[]>;
  getCachedPurchaseInvoices(params: {
    branchId: string;
    companyId: string;
    documentType?: 'DISPATCH' | 'INVOICE' | 'ORDER';
    limit?: number;
    page?: number;
    supplierId?: string;
  }): Promise<{
    data: (CachedPurchaseInvoiceRecord & { items: CachedPurchaseInvoiceItemRecord[] })[];
    pagination: { limit: number; page: number; total: number; totalPages: number };
  }>;
  getCachedCustomers(companyId: string, search?: string): Promise<CachedCustomerRecord[]>;
  listCachedBundles(companyId: string): Promise<CachedBundleRecord[]>;
  getLocalSetting(key: string, defaultValue?: string): Promise<string | null>;
  setLocalSetting(key: string, value: string): Promise<void>;

  getCompanyAccessSnapshot(companyId: string): Promise<CompanyAccessSnapshot | null>;
  getCachedSession(): Promise<OfflineAuthResult | null>;
  getHardwareConfig(): Promise<HardwareConfig>;
  getQueueStatus(): Promise<SyncStatusSummary>;
  getRuntimeInfo(): Promise<RuntimeInfo>;
  getSetupState(): Promise<SetupState>;
  getUiPreset(): Promise<UiPresetState>;
  listPendingRefunds(limit?: number): Promise<PendingRefundRecord[]>;
  listPendingSales(limit?: number): Promise<PendingSaleRecord[]>;
  listPendingCustomerOps(limit?: number): Promise<CustomerOpQueueRecord[]>;
  listPendingProductOps(limit?: number): Promise<ProductOpQueueRecord[]>;
  listPendingPurchaseOps(limit?: number): Promise<PurchaseOpQueueRecord[]>;
  listPendingStockOps(limit?: number): Promise<StockOpQueueRecord[]>;
  listPendingSupplierOps(limit?: number): Promise<SupplierOpQueueRecord[]>;
  getLocalDailyReport(query: {
    companyId: string;
    limit?: number;
    referenceAt?: string;
    registerId: string;
  }): Promise<LocalDailyReportSnapshot>;
  listSecurityEvents(limit?: number): Promise<SecurityEventRecord[]>;
  listShiftHandovers(query?: ListOpsQuery): Promise<ShiftHandoverRecord[]>;
  listCashMovements(query?: ListOpsQuery): Promise<CashMovementRecord[]>;
  logSecurityEvent(payload: LogSecurityEventPayload): Promise<SecurityEventRecord>;
  recordShiftHandover(payload: RecordShiftHandoverPayload): Promise<ShiftHandoverRecord>;
  recordCashMovement(payload: RecordCashMovementPayload): Promise<CashMovementRecord>;
  offlineLogin(payload: {
    companyId?: string;
    password: string;
    username: string;
  }): Promise<OfflineAuthResult | null>;
  openCashDrawer(options?: CashDrawerOpenOptions): Promise<CashDrawerActionResult>;
  printReceipt(payload: ReceiptPrintPayload): Promise<PrinterActionResult>;
  printBarcode(payload: { barcode: string; name: string; price: number; copyCount?: number }): Promise<PrinterActionResult>;
  queueRefund(payload: { localId?: string; refund: PendingRefund }): Promise<PendingRefundRecord>;
  queueSale(payload: { localId?: string; sale: PendingSale }): Promise<PendingSaleRecord>;
  queueProductOp(payload: {
    localId?: string;
    opType: ProductOpType;
    payload: unknown;
  }): Promise<ProductOpQueueRecord>;
  queueStockOp(payload: {
    localId?: string;
    opType: StockOpType;
    payload: unknown;
  }): Promise<StockOpQueueRecord>;
  queueCustomerOp(payload: {
    localId?: string;
    opType: 'CREATE' | 'DELETE' | 'UPDATE';
    payload: unknown;
  }): Promise<CustomerOpQueueRecord>;
  reprintLastReceipt(): Promise<PrinterActionResult>;
  runSync(options?: SyncRunOptions): Promise<SyncRunResult>;
  completeSetup(message?: string): Promise<SetupState>;
  incrementSetupOperatorIntervention(): Promise<SetupState>;
  markFirstSale(atIso?: string): Promise<SetupState>;
  resetSetup(message?: string): Promise<SetupState>;
  setOfflineReadinessPassed(passed: boolean): Promise<SetupState>;
  setHardwareConfig(payload: HardwareConfig): Promise<void>;
  setCompanyAccessSnapshot(payload: CompanyAccessSnapshot): Promise<void>;
  setManagerPin(payload: { pin: string }): Promise<void>;
  testHardwareDrawer(): Promise<CashDrawerActionResult>;
  testHardwarePrint(): Promise<PrinterActionResult>;
  updateSetupStep(payload: SetupStepUpdatePayload): Promise<SetupState>;
  setUiPreset(payload: { touchDensity?: TouchDensity; uiPreset: UiPreset }): Promise<void>;
  verifyManagerUnlock(payload: {
    companyId?: string;
    password?: string;
    pin?: string;
    username?: string;
  }): Promise<ManagerUnlockResult>;
  requestManagerSmsCode(payload: { username: string }): Promise<{ success: boolean; message: string }>;
  verifyManagerSmsCode(payload: { code: string; username: string }): Promise<ManagerUnlockResult>;
  createEInvoice(payload: any): Promise<any>;
  getEInvoiceStatus(externalId: string): Promise<any>;
  processYNOKCPayment(payload: any): Promise<any>;
  configureYNOKC(config: { brand: unknown; ip: string; port: number }): Promise<void>;
  selectDirectory(): Promise<string | null>;
  copyBackupToPath(fileName: string, targetPath: string): Promise<boolean>;
  retryQueueRecord(entity: string, id: string): Promise<boolean>;
  deleteQueueRecord(entity: string, id: string): Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}
