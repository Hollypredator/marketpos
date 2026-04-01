import type { PendingRefund, PendingSale } from './services/types';

export interface CachedUserRecord {
  branchId: string | null;
  companyId: string;
  fullName: string;
  id: string;
  isActive: boolean;
  role: string;
  username: string;
}

export interface CachedCategoryRecord {
  color: string | null;
  companyId: string;
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface CachedProductRecord {
  barcode: string;
  categoryId: string | null;
  companyId: string;
  id: string;
  isQuickAccess: boolean;
  name: string;
  quickAccessColor: string | null;
  quickAccessOrder: number | null;
  salePrice: number;
  vatRate: number;
}

export interface RuntimeInfo {
  apiBaseUrl: string;
  databasePath: string;
  isPackaged: boolean;
  platform: string;
  userDataPath: string;
  version: string;
}

export type UiPreset = 'cafe' | 'kasap' | 'market' | 'pide';
export type TouchDensity = 'compact' | 'comfortable';
export type ManagerUnlockMethod = 'PASSWORD' | 'PIN';
export type SetupStepId =
  | 'RUNTIME_CHECK'
  | 'HARDWARE_PROFILE'
  | 'HARDWARE_TEST'
  | 'ONLINE_ACTIVATION'
  | 'GO_LIVE';
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
  setupVersion: number;
  steps: SetupStepState[];
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
}

export interface PendingRefundRecord {
  createdAt: string;
  id: string;
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
}

export interface SyncRunOptions {
  accessToken?: string;
  maxPushItems?: number;
  registerId: string;
}

export interface SyncRunResult {
  errors: string[];
  pulledCategories: CachedCategoryRecord[];
  pulledProducts: CachedProductRecord[];
  pulledUsers: CachedUserRecord[];
  pushedRefundIds: string[];
  pushedRefunds: number;
  pushedSaleIds: string[];
  pushedSales: number;
  success: boolean;
  syncedAt: string;
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
  cacheSyncData(payload: {
    categories: CachedCategoryRecord[];
    products: CachedProductRecord[];
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
  queueRefund(payload: { localId?: string; refund: PendingRefund }): Promise<PendingRefundRecord>;
  queueSale(payload: { localId?: string; sale: PendingSale }): Promise<PendingSaleRecord>;
  reprintLastReceipt(): Promise<PrinterActionResult>;
  runSync(options?: SyncRunOptions): Promise<SyncRunResult>;
  completeSetup(message?: string): Promise<SetupState>;
  resetSetup(message?: string): Promise<SetupState>;
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
}

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}
