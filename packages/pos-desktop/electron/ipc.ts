import type {
  BackupPolicy,
  CashMovementRecord,
  CashMovementType,
  CachedCategoryRecord,
  CachedProductRecord,
  CachedUserRecord,
  CacheLoginPayload,
  CompanyAccessSnapshot,
  HardwareConfig,
  ListCachedProductsOptions,
  LogSecurityEventPayload,
  ManagerUnlockResult,
  OfflineAuthResult,
  PendingRefundRecord,
  PendingSaleRecord,
  RecordCashMovementPayload,
  RecordShiftHandoverPayload,
  SecurityEventRecord,
  SetupState,
  SetupStepId,
  SetupStepStatus,
  ShiftHandoverRecord,
  TouchDensity,
  UiPreset,
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
  BACKUP_CREATE: 'backup:create',
  BACKUP_GET_POLICY: 'backup:get-policy',
  BACKUP_LIST: 'backup:list',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_SET_POLICY: 'backup:set-policy',
  AUTH_CACHE_ONLINE_LOGIN: 'auth:cache-online-login',
  AUTH_CLEAR_SESSION: 'auth:clear-session',
  AUTH_GET_CACHED_SESSION: 'auth:get-cached-session',
  AUTH_OFFLINE_LOGIN: 'auth:offline-login',
  AUTH_SET_MANAGER_PIN: 'auth:set-manager-pin',
  AUTH_VERIFY_MANAGER_UNLOCK: 'auth:verify-manager-unlock',
  CASH_DRAWER_OPEN: 'cash-drawer:open',
  DB_CACHE_SYNC_DATA: 'db:cache-sync-data',
  DB_GET_CATEGORIES: 'db:get-categories',
  DB_GET_PRODUCTS: 'db:get-products',
  DB_LIST_PENDING_REFUNDS: 'db:list-pending-refunds',
  DB_LIST_PENDING_SALES: 'db:list-pending-sales',
  OPS_LIST_CASH_MOVEMENTS: 'ops:list-cash-movements',
  OPS_LIST_SHIFT_HANDOVERS: 'ops:list-shift-handovers',
  OPS_RECORD_CASH_MOVEMENT: 'ops:record-cash-movement',
  OPS_RECORD_SHIFT_HANDOVER: 'ops:record-shift-handover',
  DB_QUEUE_REFUND: 'db:queue-refund',
  DB_QUEUE_SALE: 'db:queue-sale',
  DB_QUEUE_STATUS: 'db:queue-status',
  HARDWARE_GET_CONFIG: 'hardware:get-config',
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
  SETUP_RESET: 'setup:reset',
  SETUP_UPDATE_STEP: 'setup:update-step',
  SYNC_RUN: 'sync:run',
} as const;

export interface RuntimeInfo {
  apiBaseUrl: string;
  databasePath: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
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
  createBackup(): Promise<BackupFileRecord>;
  getBackupPolicy(): Promise<BackupPolicyState>;
  listBackups(): Promise<BackupFileRecord[]>;
  restoreBackup(payload: BackupRestorePayload): Promise<BackupFileRecord>;
  setBackupPolicy(payload: BackupPolicy): Promise<BackupPolicyState>;
  cacheOnlineLogin(payload: CacheLoginPayload): Promise<void>;
  cacheSyncData(payload: UpsertSyncDataPayload): Promise<void>;
  clearSession(): Promise<void>;
  getCachedCategories(companyId: string): Promise<CachedCategoryRecord[]>;
  getCachedProducts(
    options: ListCachedProductsOptions,
  ): Promise<CachedProductRecord[]>;
  getCompanyAccessSnapshot(companyId: string): Promise<CompanyAccessSnapshot | null>;
  getCachedSession(): Promise<OfflineAuthResult | null>;
  getHardwareConfig(): Promise<HardwareConfig>;
  getQueueStatus(): Promise<{ refunds: number; sales: number }>;
  getRuntimeInfo(): Promise<RuntimeInfo>;
  getSetupState(): Promise<SetupState>;
  getUiPreset(): Promise<UiPresetState>;
  listPendingRefunds(limit?: number): Promise<PendingRefundRecord[]>;
  listPendingSales(limit?: number): Promise<PendingSaleRecord[]>;
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
  queueRefund(payload: QueueRefundPayload): Promise<PendingRefundRecord>;
  queueSale(payload: QueueSalePayload): Promise<PendingSaleRecord>;
  reprintLastReceipt(): Promise<PrinterActionResult>;
  runSync(options?: SyncRunOptions): Promise<SyncRunResult>;
  setHardwareConfig(payload: HardwareConfig): Promise<void>;
  completeSetup(message?: string): Promise<SetupState>;
  resetSetup(message?: string): Promise<SetupState>;
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
}

export type {
  BackupPolicy,
  CashMovementRecord,
  CashMovementType,
  CachedCategoryRecord,
  CachedProductRecord,
  CachedUserRecord,
  CacheLoginPayload,
  CompanyAccessSnapshot,
  HardwareConfig,
  ListCachedProductsOptions,
  LogSecurityEventPayload,
  ManagerUnlockResult,
  OfflineAuthResult,
  PendingRefundRecord,
  PendingSaleRecord,
  RecordCashMovementPayload,
  RecordShiftHandoverPayload,
  SecurityEventRecord,
  SetupState,
  SetupStepId,
  SetupStepStatus,
  ShiftHandoverRecord,
  TouchDensity,
  UiPreset,
  UpsertSyncDataPayload,
};
