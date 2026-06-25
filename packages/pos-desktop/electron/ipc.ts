import type {
  BackofficeSettings,
  BackupPolicy,
  CashMovementRecord,
  CashMovementType,
  CachedBundleRecord,
  CachedCategoryRecord,
  CachedPurchaseInvoiceItemRecord,
  CachedPurchaseInvoiceRecord,
  CachedProductRecord,
  CachedSupplierRecord,
  CachedUserRecord,
  CacheLoginPayload,
  CompanyAccessSnapshot,
  CustomerOpQueueRecord,
  CustomerOpType,
  HardwareConfig,
  ListCachedProductsOptions,
  LocalDailyReportSnapshot,
  LogSecurityEventPayload,
  ManagerUnlockResult,
  OfflineAuthResult,
  PendingRefundRecord,
  PendingSaleRecord,
  ProductOpQueueRecord,
  ProductOpType,
  PurchaseOpQueueRecord,
  RecordCashMovementPayload,
  RecordShiftHandoverPayload,
  SecurityEventRecord,
  SetupState,
  SetupMetrics,
  SetupStepId,
  SetupStepStatus,
  SyncHealthStatus,
  SyncStatusSummary,
  StockOpQueueRecord,
  StockOpType,
  SupplierOpQueueRecord,
  ShiftHandoverRecord,
  TouchDensity,
  UiPreset,
  UpdateAuthTokensPayload,
  UpsertSyncDataPayload,
} from './services/database';
import type {
  CashDrawerActionResult,
  CashDrawerOpenOptions,
} from './services/cash-drawer';
import type { PrinterActionResult, ReceiptPrintPayload } from './services/printer';
import type { SyncRunOptions, SyncRunResult } from './services/sync';

export const IPC_CHANNELS = {
  APP_ENSURE_INTERACTIVE: 'app:ensure-interactive',
  APP_GET_UI_PRESET: 'app:get-ui-preset',
  APP_RUNTIME_INFO: 'app:runtime-info',
  APP_SET_UI_PRESET: 'app:set-ui-preset',
  BACKOFFICE_GET_SETTINGS: 'backoffice:get-settings',
  BACKOFFICE_SET_SETTINGS: 'backoffice:set-settings',
  BACKUP_CREATE: 'backup:create',
  BACKUP_GET_POLICY: 'backup:get-policy',
  BACKUP_LIST: 'backup:list',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_SET_POLICY: 'backup:set-policy',
  AUTH_CACHE_ONLINE_LOGIN: 'auth:cache-online-login',
  AUTH_UPDATE_TOKENS: 'auth:update-tokens',
  AUTH_CLEAR_SESSION: 'auth:clear-session',
  AUTH_GET_CACHED_SESSION: 'auth:get-cached-session',
  AUTH_OFFLINE_LOGIN: 'auth:offline-login',
  AUTH_SET_MANAGER_PIN: 'auth:set-manager-pin',
  AUTH_VERIFY_MANAGER_UNLOCK: 'auth:verify-manager-unlock',
  CASH_DRAWER_OPEN: 'cash-drawer:open',
  DB_CACHE_SYNC_DATA: 'db:cache-sync-data',
  DB_GET_CATEGORIES: 'db:get-categories',
  DB_GET_PRODUCTS: 'db:get-products',
  DB_GET_SUPPLIERS: 'db:get-suppliers',
  DB_GET_PURCHASE_INVOICES: 'db:get-purchase-invoices',
  DB_GET_CUSTOMERS: 'db:get-customers',
  DB_GET_BUNDLES: 'db:get-bundles',
  DB_QUEUE_CUSTOMER_OP: 'db:queue-customer-op',
  APP_GET_LOCAL_SETTING: 'app:get-local-setting',
  APP_SET_LOCAL_SETTING: 'app:set-local-setting',

  DB_LIST_PENDING_REFUNDS: 'db:list-pending-refunds',
  DB_LIST_PENDING_SALES: 'db:list-pending-sales',
  DB_LIST_PENDING_CUSTOMER_OPS: 'db:list-pending-customer-ops',
  DB_LIST_PENDING_PRODUCT_OPS: 'db:list-pending-product-ops',
  DB_LIST_PENDING_PURCHASE_OPS: 'db:list-pending-purchase-ops',
  DB_LIST_PENDING_STOCK_OPS: 'db:list-pending-stock-ops',
  DB_LIST_PENDING_SUPPLIER_OPS: 'db:list-pending-supplier-ops',
  REPORTS_GET_LOCAL_DAILY: 'reports:get-local-daily',
  OPS_LIST_CASH_MOVEMENTS: 'ops:list-cash-movements',
  OPS_LIST_SHIFT_HANDOVERS: 'ops:list-shift-handovers',
  OPS_RECORD_CASH_MOVEMENT: 'ops:record-cash-movement',
  OPS_RECORD_SHIFT_HANDOVER: 'ops:record-shift-handover',
  DB_QUEUE_REFUND: 'db:queue-refund',
  DB_QUEUE_SALE: 'db:queue-sale',
  DB_QUEUE_PRODUCT_OP: 'db:queue-product-op',
  DB_QUEUE_STOCK_OP: 'db:queue-stock-op',
  DB_QUEUE_STATUS: 'db:queue-status',
  HARDWARE_GET_CONFIG: 'hardware:get-config',
  HARDWARE_PRINT_BARCODE: 'hardware:print-barcode',
  HARDWARE_REPRINT_LAST_RECEIPT: 'hardware:reprint-last-receipt',
  HARDWARE_SET_CONFIG: 'hardware:set-config',
  HARDWARE_TEST_DRAWER: 'hardware:test-drawer',
  HARDWARE_TEST_PRINT: 'hardware:test-print',
  LICENSE_GET_ACCESS_SNAPSHOT: 'license:get-access-snapshot',
  LICENSE_SET_ACCESS_SNAPSHOT: 'license:set-access-snapshot',
  PRINTER_PRINT_RECEIPT: 'printer:print-receipt',
  SECURITY_LIST_EVENTS: 'security:list-events',
  SECURITY_LOG_EVENT: 'security:log-event',
  SETUP_COMPLETE: 'setup:complete',
  SETUP_GET_STATE: 'setup:get-state',
  SETUP_INCREMENT_OPERATOR_INTERVENTION: 'setup:increment-operator-intervention',
  SETUP_MARK_FIRST_SALE: 'setup:mark-first-sale',
  SETUP_RESET: 'setup:reset',
  SETUP_SET_OFFLINE_READINESS: 'setup:set-offline-readiness',
  SETUP_UPDATE_STEP: 'setup:update-step',
  SYNC_RUN: 'sync:run',
  SECURITY_REQUEST_MANAGER_SMS: 'security:request-manager-sms',
  SECURITY_VERIFY_MANAGER_SMS: 'security:verify-manager-sms',
  EINVOICE_CREATE: 'einvoice:create',
  EINVOICE_GET_STATUS: 'einvoice:get-status',
  YNOKC_PROCESS_PAYMENT: 'ynokc:process-payment',
  YNOKC_CONFIGURE: 'ynokc:configure',
  APP_SELECT_DIRECTORY: 'app:select-directory',
  BACKUP_EXPORT_TO_PATH: 'backup:export-to-path',
  DB_RETRY_QUEUE_RECORD: 'db:retry-queue-record',
  DB_DELETE_QUEUE_RECORD: 'db:delete-queue-record',
} as const;

export interface RuntimeInfo {
  apiBaseUrl: string;
  databasePath: string;
  isPackaged: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncHealthStatus;
  offlineReadinessPassed: boolean;
  pendingCount: number;
  platform: NodeJS.Platform;
  setupMetrics: SetupMetrics;
  userDataPath: string;
  version: string;
}

export interface UiPresetState {
  touchDensity: TouchDensity;
  uiPreset: UiPreset;
}

export interface ManagerUnlockPayload {
  companyId?: string;
  password?: string;
  pin?: string;
  username?: string;
}

export interface QueueSalePayload {
  localId?: string;
  sale: unknown;
}

export interface QueueRefundPayload {
  localId?: string;
  refund: unknown;
}

export interface QueueProductOpPayload {
  localId?: string;
  opType: ProductOpType;
  payload: unknown;
}

export interface QueueStockOpPayload {
  localId?: string;
  opType: StockOpType;
  payload: unknown;
}

export interface QueueCustomerOpPayload {
  localId?: string;
  opType: CustomerOpType;
  payload: unknown;
}

export interface LocalDailyReportQuery {
  companyId: string;
  limit?: number;
  referenceAt?: string;
  registerId: string;
  from?: string;
  to?: string;
}

export interface SetupStepUpdatePayload {
  detail?: string | null;
  status: SetupStepStatus;
  stepId: SetupStepId;
}

export interface BackupFileRecord {
  createdAt: string;
  fileName: string;
  path: string;
  sizeBytes: number;
}

export interface ListOpsQuery {
  limit?: number;
  registerId?: string;
}

export interface BackupRestorePayload {
  fileName: string;
}

export interface BackupPolicyState extends BackupPolicy {
  nextRunAt: string | null;
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
  cacheOnlineLogin(payload: CacheLoginPayload): Promise<void>;
  updateCachedAuthTokens(payload: UpdateAuthTokensPayload): Promise<void>;
  cacheSyncData(payload: UpsertSyncDataPayload): Promise<void>;
  clearSession(): Promise<void>;
  getCachedCategories(companyId: string): Promise<CachedCategoryRecord[]>;
  getCachedProducts(
    options: ListCachedProductsOptions,
  ): Promise<CachedProductRecord[]>;
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
  getCachedCustomers(companyId: string, search?: string): Promise<any[]>;
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
  getLocalDailyReport(
    query: LocalDailyReportQuery,
  ): Promise<LocalDailyReportSnapshot>;
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
  queueRefund(payload: QueueRefundPayload): Promise<PendingRefundRecord>;
  queueSale(payload: QueueSalePayload): Promise<PendingSaleRecord>;
  queueProductOp(payload: QueueProductOpPayload): Promise<ProductOpQueueRecord>;
  queueStockOp(payload: QueueStockOpPayload): Promise<StockOpQueueRecord>;
  queueCustomerOp(payload: QueueCustomerOpPayload): Promise<CustomerOpQueueRecord>;
  reprintLastReceipt(): Promise<PrinterActionResult>;
  runSync(options?: SyncRunOptions): Promise<SyncRunResult>;
  setHardwareConfig(payload: HardwareConfig): Promise<void>;
  completeSetup(message?: string): Promise<SetupState>;
  incrementSetupOperatorIntervention(): Promise<SetupState>;
  markFirstSale(atIso?: string): Promise<SetupState>;
  resetSetup(message?: string): Promise<SetupState>;
  setOfflineReadinessPassed(passed: boolean): Promise<SetupState>;
  setCompanyAccessSnapshot(payload: CompanyAccessSnapshot): Promise<void>;
  setManagerPin(payload: { pin: string }): Promise<void>;
  updateSetupStep(payload: SetupStepUpdatePayload): Promise<SetupState>;
  testHardwareDrawer(): Promise<CashDrawerActionResult>;
  testHardwarePrint(): Promise<PrinterActionResult>;
  setUiPreset(payload: {
    touchDensity?: TouchDensity;
    uiPreset: UiPreset;
  }): Promise<void>;
  verifyManagerUnlock(payload: ManagerUnlockPayload): Promise<ManagerUnlockResult>;
  requestManagerSmsCode(payload: { username: string }): Promise<{ success: boolean; message: string }>;
  verifyManagerSmsCode(payload: { code: string; username: string }): Promise<ManagerUnlockResult>;

  createEInvoice(payload: import('./services/e-invoice').EInvoicePayload): Promise<import('./services/e-invoice').EInvoiceResult>;
  getEInvoiceStatus(externalId: string): Promise<import('./services/e-invoice').EInvoiceStatus>;

  processYNOKCPayment(payload: import('./services/yn-okc').YNOKCPaymentPayload): Promise<import('./services/yn-okc').YNOKCResult>;
  configureYNOKC(config: { brand: import('./services/yn-okc').YNOKCBrand; ip: string; port: number }): Promise<void>;

  selectDirectory(): Promise<string | null>;
  copyBackupToPath(fileName: string, targetPath: string): Promise<boolean>;
  retryQueueRecord(entity: string, id: string): Promise<boolean>;
  deleteQueueRecord(entity: string, id: string): Promise<boolean>;
}

export type {
  BackofficeSettings,
  BackupPolicy,
  CashMovementRecord,
  CashMovementType,
  CachedCategoryRecord,
  CachedPurchaseInvoiceItemRecord,
  CachedPurchaseInvoiceRecord,
  CachedProductRecord,
  CachedSupplierRecord,
  CachedUserRecord,
  CacheLoginPayload,
  CompanyAccessSnapshot,
  CustomerOpQueueRecord,
  CustomerOpType,
  HardwareConfig,
  ListCachedProductsOptions,
  LogSecurityEventPayload,
  ManagerUnlockResult,
  OfflineAuthResult,
  PendingRefundRecord,
  PendingSaleRecord,
  ProductOpQueueRecord,
  ProductOpType,
  PurchaseOpQueueRecord,
  LocalDailyReportSnapshot,
  RecordCashMovementPayload,
  RecordShiftHandoverPayload,
  SecurityEventRecord,
  SetupState,
  SetupMetrics,
  SetupStepId,
  SetupStepStatus,
  SyncHealthStatus,
  SyncStatusSummary,
  StockOpQueueRecord,
  StockOpType,
  SupplierOpQueueRecord,
  ShiftHandoverRecord,
  TouchDensity,
  UiPreset,
  UpdateAuthTokensPayload,
  UpsertSyncDataPayload,
};
