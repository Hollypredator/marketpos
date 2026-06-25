import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  createSaleSchema,
  createRefundSchema,
  createProductSchema,
  updateProductSchema,
  createStockMovementSchema,
} from './validators';
import {
  CachedUserRecord,
  CachedCategoryRecord,
  CachedProductRecord,
  CachedSupplierRecord,
  CachedPurchaseInvoiceRecord,
  CachedPurchaseInvoiceItemRecord,
  CachedBundleRecord,
  CustomerOpQueueRecord,
  PendingSaleRecord,
  PendingRefundRecord,
  ProductOpQueueRecord,
  PurchaseOpQueueRecord,
  QueueEntityStatusSummary,
  StockOpQueueRecord,
  SupplierOpQueueRecord,
  SyncStatusSummary,
  SyncHealthStatus,
} from './types';

export type {
  CachedUserRecord,
  CachedCategoryRecord,
  CachedProductRecord,
  CachedSupplierRecord,
  CachedPurchaseInvoiceRecord,
  CachedPurchaseInvoiceItemRecord,
  CachedBundleRecord,
  CustomerOpQueueRecord,
  PendingSaleRecord,
  PendingRefundRecord,
  ProductOpQueueRecord,
  PurchaseOpQueueRecord,
  QueueEntityStatusSummary,
  StockOpQueueRecord,
  SupplierOpQueueRecord,
  SyncStatusSummary,
  SyncHealthStatus,
};

import Database from 'better-sqlite3';
import {
  DEFAULT_HARDWARE_CONFIG,
  normalizeHardwareConfig,
  parseHardwareConfigJson,
  serializeHardwareConfig,
  type HardwareConfig,
} from './hardware-config';

export type { HardwareConfig };

export type LocalSyncStatus = 'FAILED' | 'PENDING' | 'SYNCED';
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
export type CustomerOpType = 'CREATE' | 'DELETE' | 'UPDATE';
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
export type SecurityEventSeverity = 'CRITICAL' | 'INFO' | 'WARN';
export type CashMovementType = 'DROP' | 'PETTY_CASH' | 'SAFE_IN' | 'SAFE_OUT';
export type ProductOpType = 'CREATE' | 'DELETE' | 'UPDATE';
export type PurchaseOpType = 'CREATE' | 'DELETE' | 'UPDATE';
export type StockOpType = 'MOVEMENT';
export type SupplierOpType = 'CREATE' | 'DELETE' | 'UPDATE';

export interface BackupPolicy {
  enabled: boolean;
  intervalHours: number;
  lastRunAt: string | null;
  maxBackups: number;
  retentionDays: number;
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
  signature: string;
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

export interface BackofficeDiscountPolicy {
  maxCartDiscountAmount: number;
  maxCartDiscountPercent: number;
  maxItemDiscountAmount: number;
  maxItemDiscountPercent: number;
}

export interface BackofficeOfflineAuditPolicy {
  maxPendingProductOps: number;
  maxPendingRefunds: number;
  maxPendingSales: number;
  maxPendingStockOps: number;
}

export interface BackofficeRolePolicy {
  accountantReadOnly: boolean;
  cashierCanOpenOperations: boolean;
}

export interface BackofficeSettings {
  discountPolicy: BackofficeDiscountPolicy;
  offlineAudit: BackofficeOfflineAuditPolicy;
  rolePolicy: BackofficeRolePolicy;
  version: 1;
}

export interface SetBackofficeSettingsPayload {
  operatorUserId?: string | null;
  patch: Partial<BackofficeSettings>;
}

export interface SetupStepUpdatePayload {
  detail?: string | null;
  status: SetupStepStatus;
  stepId: SetupStepId;
}

export interface OfflineAuthResult {
  accessToken: string | null;
  companyAccess: CompanyAccessSnapshot | null;
  refreshToken: string | null;
  registerId: string | null;
  sessionId: string | null;
  user: CachedUserRecord;
}

export interface ManagerUnlockResult {
  method: ManagerUnlockMethod;
  requiresPinSetup: boolean;
  user: CachedUserRecord;
}

interface PendingQueueRow {
  failure_count?: number;
  id: string;
  payload_data: string;
  sync_error?: string | null;
  sync_status: LocalSyncStatus;
  created_at: string;
  synced_at: string | null;
}

interface PendingOperationQueueRow extends PendingQueueRow {
  op_type: string;
}

interface SettingsRow {
  value: string;
}

interface StoredReceiptPayload {
  copyCount?: number;
  lines: string[];
}

interface CachedUserRow {
  branch_id: string | null;
  company_id: string;
  full_name: string;
  id: string;
  is_active: number;
  role: string;
  username: string;
}

interface CachedCategoryRow {
  color: string | null;
  company_id: string;
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

interface CachedProductRow {
  barcode: string;
  brand: string | null;
  campaign_json: string | null;
  category_id: string | null;
  company_id: string;
  description: string | null;
  expiry_date: string | null;
  id: string;
  is_active: number;
  is_quick_access: number;
  name: string;
  purchase_price: number;
  quick_access_color: string | null;
  quick_access_order: number | null;
  sale_price: number;
  supplier_id: string | null;
  supplier_name: string | null;
  wholesale_price: number | null;
  vat_rate: number;
  stock_level: number;
  estimated_stock: number;
}

interface CachedSupplierRow {
  id: string;
  company_id: string;
  name: string;
  balance: number | null;
  phone: string | null;
  tax_number: string | null;
  is_active: number;
}

interface CachedPurchaseInvoiceRow {
  id: string;
  company_id: string;
  branch_id: string;
  supplier_id: string;
  invoice_number: string;
  document_type: string | null;
  dispatch_number: string | null;
  document_date: string | null;
  due_date: string | null;
  source_dispatch_id: string | null;
  converted_to_invoice_id: string | null;
  converted_at: string | null;
  subtotal: number | null;
  total_vat: number | null;
  total_discount: number | null;
  grand_total: number | null;
  total_grand_total: number | null;
  status: string;
  invoice_date: string | null;
  created_at: string | null;
  updated_at: string;
}

interface CachedPurchaseInvoiceItemRow {
  id: string;
  purchase_invoice_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  vat_amount: number | null;
  discount: number | null;
  line_total: number;
  updated_at: string;
}


interface SecurityEventRow {
  created_at: string;
  event_type: string;
  id: string;
  manager_user_id: string | null;
  message: string;
  metadata_json: string | null;
  operator_user_id: string | null;
  reason: string | null;
  severity: SecurityEventSeverity;
}

interface ShiftHandoverRow {
  blind_close: number;
  created_at: string;
  declared_cash: number;
  difference: number;
  expected_cash: number;
  id: string;
  manager_user_id: string | null;
  note: string | null;
  operator_user_id: string;
  register_id: string;
}

interface CashMovementRow {
  amount: number;
  created_at: string;
  id: string;
  movement_type: CashMovementType;
  note: string | null;
  operator_user_id: string;
  register_id: string;
}

interface LocalQueueReportRow {
  created_at: string;
  payload_data: string;
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

export interface CacheLoginPayload {
  accessToken: string;
  companyAccess?: CompanyAccessSnapshot;
  password: string;
  refreshToken: string;
  registerId: string;
  sessionId: string;
  user: CachedUserRecord;
}

export interface UpdateAuthTokensPayload {
  accessToken: string;
  companyAccess?: CompanyAccessSnapshot;
  refreshToken: string;
}

export interface UpsertSyncDataPayload {
  categories: CachedCategoryRecord[];
  products: CachedProductRecord[];
  users: CachedUserRecord[];
  suppliers: CachedSupplierRecord[];
  customers: (any & { loyaltyPoints?: number })[];
  purchaseInvoices: (CachedPurchaseInvoiceRecord & { items: CachedPurchaseInvoiceItemRecord[] })[];
  bundles: CachedBundleRecord[];
}


export interface ListCachedProductsOptions {
  categoryId?: string;
  companyId: string;
  quickAccessOnly?: boolean;
  search?: string;
}

const AUTH_ACCESS_TOKEN_KEY = 'auth_access_token';
const AUTH_COMPANY_ID_KEY = 'auth_company_id';
const AUTH_REFRESH_TOKEN_KEY = 'auth_refresh_token';
const AUTH_REGISTER_ID_KEY = 'auth_register_id';
const AUTH_SESSION_ID_KEY = 'auth_session_id';
const AUTH_USER_ID_KEY = 'auth_user_id';
const UI_PRESET_KEY = 'ui_preset';
const UI_TOUCH_DENSITY_KEY = 'ui_touch_density';
const MANAGER_UNLOCK_PIN_HASH_KEY = 'manager_unlock_pin_hash';
const MANAGER_UNLOCK_PIN_UPDATED_AT_KEY = 'manager_unlock_pin_updated_at';
const HARDWARE_CONFIG_KEY = 'hardware_config';
const BACKUP_POLICY_KEY = 'backup_policy';
const LAST_RECEIPT_PAYLOAD_KEY = 'last_receipt_payload';
const COMPANY_ACCESS_KEY_PREFIX = 'company_access_';
const SETUP_STATE_KEY = 'setup_state';
const BACKOFFICE_SETTINGS_KEY = 'backoffice.settings.v1';
const LAST_SYNC_AT_KEY = 'last_sync_at';
const LAST_SYNC_CURSOR_KEY = 'last_sync_cursor';
const LAST_SYNC_ERROR_CODE_KEY = 'last_sync_error_code';
const SYNC_QUEUE_PEAK_KEY = 'sync_queue_peak';
const SETUP_VERSION = 2;
const LEGACY_SETUP_VERSION = 1;
const MIN_BACKUP_INTERVAL_HOURS = 1;
const MAX_BACKUP_INTERVAL_HOURS = 72;
const MIN_BACKUP_RETENTION_DAYS = 1;
const MAX_BACKUP_RETENTION_DAYS = 90;
const MIN_BACKUP_MAX_FILES = 5;
const MAX_BACKUP_MAX_FILES = 240;
const DEFAULT_BACKUP_POLICY: BackupPolicy = {
  enabled: true,
  intervalHours: 8,
  lastRunAt: null,
  maxBackups: 60,
  retentionDays: 21,
};
const DEFAULT_BACKOFFICE_SETTINGS: BackofficeSettings = {
  discountPolicy: {
    maxCartDiscountAmount: 500,
    maxCartDiscountPercent: 25,
    maxItemDiscountAmount: 250,
    maxItemDiscountPercent: 40,
  },
  offlineAudit: {
    maxPendingProductOps: 100,
    maxPendingRefunds: 100,
    maxPendingSales: 100,
    maxPendingStockOps: 150,
  },
  rolePolicy: {
    accountantReadOnly: true,
    cashierCanOpenOperations: false,
  },
  version: 1,
};
const SETUP_STEP_ORDER: SetupStepId[] = [
  'INSTALL_PREFS',
  'LICENSE',
  'ACCOUNT',
  'MODE_SELECT',
  'FINALIZE',
];

type LegacySetupStepId =
  | 'RUNTIME_CHECK'
  | 'HARDWARE_PROFILE'
  | 'HARDWARE_TEST'
  | 'ONLINE_ACTIVATION'
  | 'GO_LIVE';

const LEGACY_SETUP_STEP_ORDER: LegacySetupStepId[] = [
  'RUNTIME_CHECK',
  'HARDWARE_PROFILE',
  'HARDWARE_TEST',
  'ONLINE_ACTIVATION',
  'GO_LIVE',
];

const SAFE_DEFAULT_HARDWARE_CONFIG: HardwareConfig = {
  connectionMode: 'LAN',
  copyCount: 1,
  drawerPulse: {
    off: 120,
    on: 50,
  },
  port: 9100,
  target: '127.0.0.1',
  timeout: 3000,
};

function cloneHardwareConfig(config: HardwareConfig): HardwareConfig {
  return {
    ...config,
    drawerPulse: {
      off: config.drawerPulse.off,
      on: config.drawerPulse.on,
    },
  };
}

function fallbackNormalizeHardwareConfig(input: unknown): HardwareConfig {
  const source =
    typeof input === 'object' && input !== null
      ? (input as Partial<HardwareConfig>)
      : {};

  return {
    connectionMode: source.connectionMode === 'USB' ? 'USB' : 'LAN',
    copyCount:
      typeof source.copyCount === 'number' && Number.isFinite(source.copyCount)
        ? Math.max(1, Math.min(5, Math.round(source.copyCount)))
        : SAFE_DEFAULT_HARDWARE_CONFIG.copyCount,
    drawerPulse: {
      off:
        typeof source.drawerPulse?.off === 'number' &&
        Number.isFinite(source.drawerPulse.off)
          ? Math.max(0, Math.min(255, Math.round(source.drawerPulse.off)))
          : SAFE_DEFAULT_HARDWARE_CONFIG.drawerPulse.off,
      on:
        typeof source.drawerPulse?.on === 'number' &&
        Number.isFinite(source.drawerPulse.on)
          ? Math.max(0, Math.min(255, Math.round(source.drawerPulse.on)))
          : SAFE_DEFAULT_HARDWARE_CONFIG.drawerPulse.on,
    },
    port:
      typeof source.port === 'number' && Number.isFinite(source.port)
        ? Math.max(1, Math.min(65535, Math.round(source.port)))
        : SAFE_DEFAULT_HARDWARE_CONFIG.port,
    target:
      typeof source.target === 'string' && source.target.trim().length > 0
        ? source.target.trim()
        : SAFE_DEFAULT_HARDWARE_CONFIG.target,
    timeout:
      typeof source.timeout === 'number' && Number.isFinite(source.timeout)
        ? Math.max(500, Math.min(20000, Math.round(source.timeout)))
        : SAFE_DEFAULT_HARDWARE_CONFIG.timeout,
  };
}

function safeNormalizeHardwareConfig(input: unknown): HardwareConfig {
  try {
    return normalizeHardwareConfig(input);
  } catch {
    return fallbackNormalizeHardwareConfig(input);
  }
}

function safeSerializeHardwareConfig(config: HardwareConfig): string {
  try {
    return serializeHardwareConfig(config);
  } catch {
    return JSON.stringify(fallbackNormalizeHardwareConfig(config));
  }
}

function safeParseHardwareConfig(raw: string | null): HardwareConfig {
  try {
    return parseHardwareConfigJson(raw);
  } catch {
    if (!raw) {
      return cloneHardwareConfig(SAFE_DEFAULT_HARDWARE_CONFIG);
    }
    try {
      return safeNormalizeHardwareConfig(JSON.parse(raw));
    } catch {
      return cloneHardwareConfig(SAFE_DEFAULT_HARDWARE_CONFIG);
    }
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, encodedHash: string): boolean {
  const [salt, hash] = encodedHash.split(':');
  if (!salt || !hash) {
    return false;
  }
  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  if (stored.length !== computed.length) {
    return false;
  }
  return timingSafeEqual(stored, computed);
}

function toPendingRecord(row: PendingQueueRow & { failure_count?: number; sync_error?: string | null }): PendingSaleRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    payloadData: row.payload_data,
    syncStatus: row.sync_status,
    syncedAt: row.synced_at,
    failureCount: row.failure_count ?? 0,
    syncError: row.sync_error ?? null,
  };
}

function toPendingOperationRecord<TType extends string>(
  row: PendingOperationQueueRow & { failure_count?: number; sync_error?: string | null },
): {
  createdAt: string;
  id: string;
  opType: TType;
  payloadData: string;
  syncStatus: LocalSyncStatus;
  syncedAt: string | null;
  failureCount: number;
  syncError: string | null;
} {
  return {
    createdAt: row.created_at,
    id: row.id,
    opType: row.op_type as TType,
    payloadData: row.payload_data,
    syncStatus: row.sync_status,
    syncedAt: row.synced_at,
    failureCount: row.failure_count ?? 0,
    syncError: row.sync_error ?? null,
  };
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Bilinmeyen hata';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.trim(),
    )
  );
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeLegacyPaymentMethod(value: unknown): LocalReportPaymentMethod | null {
  if (
    value === 'CASH' ||
    value === 'CREDIT_CARD' ||
    value === 'DEBIT_CARD' ||
    value === 'ON_ACCOUNT'
  ) {
    return value;
  }
  if (value === 'CARD') {
    return 'CREDIT_CARD';
  }
  if (value === 'OTHER') {
    return 'DEBIT_CARD';
  }
  return null;
}

function readPaymentMethod(value: unknown): LocalReportPaymentMethod | null {
  return normalizeLegacyPaymentMethod(value);
}

function normalizeQueuedSalePayload(sale: unknown): unknown {
  if (!isRecord(sale) || !Array.isArray(sale.payments)) {
    return sale;
  }
  let changed = false;
  const normalizedPayments = sale.payments.map((payment) => {
    if (!isRecord(payment)) {
      return payment;
    }
    const normalizedMethod = normalizeLegacyPaymentMethod(payment.method);
    if (!normalizedMethod || normalizedMethod === payment.method) {
      return payment;
    }
    changed = true;
    return {
      ...payment,
      method: normalizedMethod,
    };
  });
  if (!changed) {
    return sale;
  }
  return {
    ...sale,
    payments: normalizedPayments,
  };
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function toLocalDayWindow(referenceAt?: string): {
  dayLabel: string;
  endIso: string;
  startIso: string;
} {
  const base = referenceAt ? new Date(referenceAt) : new Date();
  const safeBase = Number.isFinite(base.getTime()) ? base : new Date();
  const start = new Date(safeBase);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    dayLabel: start.toISOString().slice(0, 10),
    endIso: end.toISOString(),
    startIso: start.toISOString(),
  };
}

function normalizeUiPreset(value: string | null): UiPreset {
  if (value === 'market' || value === 'cafe' || value === 'pide' || value === 'kasap') {
    return value;
  }
  return 'market';
}

function normalizeTouchDensity(value: string | null): TouchDensity {
  if (value === 'compact' || value === 'comfortable') {
    return value;
  }
  return 'comfortable';
}

function clampInteger(
  value: unknown,
  params: { fallback: number; max: number; min: number },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return params.fallback;
  }
  return Math.max(params.min, Math.min(params.max, Math.round(value)));
}

function normalizeBackupPolicy(raw: unknown): BackupPolicy {
  const source =
    raw && typeof raw === 'object'
      ? (raw as Partial<BackupPolicy>)
      : {};
  const lastRunAt =
    typeof source.lastRunAt === 'string' &&
    Number.isFinite(Date.parse(source.lastRunAt))
      ? source.lastRunAt
      : null;

  return {
    enabled:
      typeof source.enabled === 'boolean'
        ? source.enabled
        : DEFAULT_BACKUP_POLICY.enabled,
    intervalHours: clampInteger(source.intervalHours, {
      fallback: DEFAULT_BACKUP_POLICY.intervalHours,
      max: MAX_BACKUP_INTERVAL_HOURS,
      min: MIN_BACKUP_INTERVAL_HOURS,
    }),
    lastRunAt,
    maxBackups: clampInteger(source.maxBackups, {
      fallback: DEFAULT_BACKUP_POLICY.maxBackups,
      max: MAX_BACKUP_MAX_FILES,
      min: MIN_BACKUP_MAX_FILES,
    }),
    retentionDays: clampInteger(source.retentionDays, {
      fallback: DEFAULT_BACKUP_POLICY.retentionDays,
      max: MAX_BACKUP_RETENTION_DAYS,
      min: MIN_BACKUP_RETENTION_DAYS,
    }),
  };
}

function clampNonNegativeNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, value);
}

function normalizeBackofficeSettings(raw: unknown): BackofficeSettings {
  const source = raw && typeof raw === 'object' ? (raw as Partial<BackofficeSettings>) : {};
  const discountPolicySource =
    source.discountPolicy && typeof source.discountPolicy === 'object'
      ? source.discountPolicy
      : {};
  const offlineAuditSource =
    source.offlineAudit && typeof source.offlineAudit === 'object'
      ? source.offlineAudit
      : {};
  const rolePolicySource =
    source.rolePolicy && typeof source.rolePolicy === 'object'
      ? source.rolePolicy
      : {};

  return {
    discountPolicy: {
      maxCartDiscountAmount: clampNonNegativeNumber(
        (discountPolicySource as Partial<BackofficeDiscountPolicy>).maxCartDiscountAmount,
        DEFAULT_BACKOFFICE_SETTINGS.discountPolicy.maxCartDiscountAmount,
      ),
      maxCartDiscountPercent: clampInteger(
        (discountPolicySource as Partial<BackofficeDiscountPolicy>).maxCartDiscountPercent,
        {
          fallback: DEFAULT_BACKOFFICE_SETTINGS.discountPolicy.maxCartDiscountPercent,
          max: 100,
          min: 0,
        },
      ),
      maxItemDiscountAmount: clampNonNegativeNumber(
        (discountPolicySource as Partial<BackofficeDiscountPolicy>).maxItemDiscountAmount,
        DEFAULT_BACKOFFICE_SETTINGS.discountPolicy.maxItemDiscountAmount,
      ),
      maxItemDiscountPercent: clampInteger(
        (discountPolicySource as Partial<BackofficeDiscountPolicy>).maxItemDiscountPercent,
        {
          fallback: DEFAULT_BACKOFFICE_SETTINGS.discountPolicy.maxItemDiscountPercent,
          max: 100,
          min: 0,
        },
      ),
    },
    offlineAudit: {
      maxPendingProductOps: clampInteger(
        (offlineAuditSource as Partial<BackofficeOfflineAuditPolicy>).maxPendingProductOps,
        {
          fallback: DEFAULT_BACKOFFICE_SETTINGS.offlineAudit.maxPendingProductOps,
          max: 1000,
          min: 1,
        },
      ),
      maxPendingRefunds: clampInteger(
        (offlineAuditSource as Partial<BackofficeOfflineAuditPolicy>).maxPendingRefunds,
        {
          fallback: DEFAULT_BACKOFFICE_SETTINGS.offlineAudit.maxPendingRefunds,
          max: 1000,
          min: 1,
        },
      ),
      maxPendingSales: clampInteger(
        (offlineAuditSource as Partial<BackofficeOfflineAuditPolicy>).maxPendingSales,
        {
          fallback: DEFAULT_BACKOFFICE_SETTINGS.offlineAudit.maxPendingSales,
          max: 1000,
          min: 1,
        },
      ),
      maxPendingStockOps: clampInteger(
        (offlineAuditSource as Partial<BackofficeOfflineAuditPolicy>).maxPendingStockOps,
        {
          fallback: DEFAULT_BACKOFFICE_SETTINGS.offlineAudit.maxPendingStockOps,
          max: 1000,
          min: 1,
        },
      ),
    },
    rolePolicy: {
      accountantReadOnly:
        typeof (rolePolicySource as Partial<BackofficeRolePolicy>).accountantReadOnly === 'boolean'
          ? Boolean((rolePolicySource as Partial<BackofficeRolePolicy>).accountantReadOnly)
          : DEFAULT_BACKOFFICE_SETTINGS.rolePolicy.accountantReadOnly,
      cashierCanOpenOperations:
        typeof (rolePolicySource as Partial<BackofficeRolePolicy>).cashierCanOpenOperations ===
        'boolean'
          ? Boolean((rolePolicySource as Partial<BackofficeRolePolicy>).cashierCanOpenOperations)
          : DEFAULT_BACKOFFICE_SETTINGS.rolePolicy.cashierCanOpenOperations,
    },
    version: 1,
  };
}

function mergeBackofficeSettings(
  current: BackofficeSettings,
  patch: Partial<BackofficeSettings>,
): BackofficeSettings {
  const merged: BackofficeSettings = {
    discountPolicy: {
      ...current.discountPolicy,
      ...(patch.discountPolicy ?? {}),
    },
    offlineAudit: {
      ...current.offlineAudit,
      ...(patch.offlineAudit ?? {}),
    },
    rolePolicy: {
      ...current.rolePolicy,
      ...(patch.rolePolicy ?? {}),
    },
    version: 1,
  };
  return normalizeBackofficeSettings(merged);
}

export function parseBackupPolicy(raw: string | null): BackupPolicy {
  if (!raw) {
    return { ...DEFAULT_BACKUP_POLICY };
  }
  try {
    return normalizeBackupPolicy(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_BACKUP_POLICY };
  }
}

export function buildDefaultSetupState(): SetupState {
  const now = new Date().toISOString();
  return {
    completedAt: null,
    lastResult: null,
    offlineReadinessPassed: false,
    setupMetrics: {
      durationMin: null,
      firstSaleAt: null,
      operatorInterventionCount: 0,
      setupStartAt: now,
    },
    setupVersion: SETUP_VERSION,
    steps: SETUP_STEP_ORDER.map((stepId) => ({
      completedAt: null,
      detail: null,
      status: 'PENDING',
      stepId,
    })),
  };
}

function parseSetupResult(value: unknown): SetupResultState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<SetupResultState>;
  if (
    (record.status !== 'FAILED' && record.status !== 'SUCCESS') ||
    typeof record.at !== 'string' ||
    typeof record.message !== 'string'
  ) {
    return null;
  }

  return {
    at: record.at,
    message: record.message,
    status: record.status,
  };
}

function parseSetupMetrics(value: unknown, fallbackStartAt: string): SetupMetrics {
  const source =
    value && typeof value === 'object'
      ? (value as Partial<SetupMetrics>)
      : {};

  const setupStartAt =
    typeof source.setupStartAt === 'string' &&
    Number.isFinite(Date.parse(source.setupStartAt))
      ? source.setupStartAt
      : fallbackStartAt;

  const firstSaleAt =
    typeof source.firstSaleAt === 'string' &&
    Number.isFinite(Date.parse(source.firstSaleAt))
      ? source.firstSaleAt
      : null;

  const durationMin =
    typeof source.durationMin === 'number' && Number.isFinite(source.durationMin)
      ? Math.max(0, source.durationMin)
      : null;

  const operatorInterventionCount =
    typeof source.operatorInterventionCount === 'number' &&
    Number.isFinite(source.operatorInterventionCount)
      ? Math.max(0, Math.round(source.operatorInterventionCount))
      : 0;

  return {
    durationMin,
    firstSaleAt,
    operatorInterventionCount,
    setupStartAt,
  };
}

function normalizeSetupStep<TStepId extends string>(
  stepId: TStepId,
  value: unknown,
): {
  completedAt: string | null;
  detail: string | null;
  status: SetupStepStatus;
  stepId: TStepId;
} {
  const source =
    value && typeof value === 'object'
      ? (value as Partial<SetupStepState>)
      : {};
  const status = source.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING';

  return {
    completedAt:
      status === 'COMPLETED' && typeof source.completedAt === 'string'
        ? source.completedAt
        : null,
    detail: typeof source.detail === 'string' ? source.detail : null,
    status,
    stepId,
  };
}

interface RawSetupState {
  completedAt?: unknown;
  lastResult?: unknown;
  offlineReadinessPassed?: unknown;
  setupMetrics?: unknown;
  setupVersion?: unknown;
  steps?: unknown;
}

function migrateLegacySetupState(raw: RawSetupState): SetupState {
  const byLegacyStepId = new Map<
    LegacySetupStepId,
    ReturnType<typeof normalizeSetupStep<LegacySetupStepId>>
  >();

  if (Array.isArray(raw.steps)) {
    for (const entry of raw.steps) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const step = entry as Partial<{ stepId: unknown }>;
      const legacyStepId = LEGACY_SETUP_STEP_ORDER.find(
        (candidate) => candidate === step.stepId,
      );
      if (!legacyStepId) {
        continue;
      }
      byLegacyStepId.set(legacyStepId, normalizeSetupStep(legacyStepId, entry));
    }
  }

  const now = new Date().toISOString();
  const legacyGoLive = byLegacyStepId.get('GO_LIVE');
  const legacyActivation = byLegacyStepId.get('ONLINE_ACTIVATION');
  const legacyRuntime = byLegacyStepId.get('RUNTIME_CHECK');
  const legacyHardwareTest = byLegacyStepId.get('HARDWARE_TEST');
  const isLegacyCompleted = legacyGoLive?.status === 'COMPLETED';

  const migratedSteps = SETUP_STEP_ORDER.map((stepId) => {
    if (isLegacyCompleted) {
      return {
        completedAt:
          legacyGoLive?.completedAt ??
          (typeof raw.completedAt === 'string' ? raw.completedAt : now),
        detail:
          typeof legacyGoLive?.detail === 'string'
            ? `migrated:v1:${legacyGoLive.detail}`
            : 'migrated:v1:legacy-complete',
        status: 'COMPLETED' as const,
        stepId,
      };
    }

    if (stepId === 'INSTALL_PREFS') {
      return normalizeSetupStep(stepId, {
        completedAt: legacyRuntime?.completedAt ?? null,
        detail:
          typeof legacyRuntime?.detail === 'string'
            ? `migrated:v1:${legacyRuntime.detail}`
            : 'migrated:v1:runtime-check',
        status: legacyRuntime?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
      });
    }

    if (stepId === 'LICENSE') {
      return normalizeSetupStep(stepId, {
        completedAt: legacyActivation?.completedAt ?? null,
        detail:
          legacyActivation?.status === 'COMPLETED'
            ? 'migrated:v1:assumed-license-accepted'
            : null,
        status: legacyActivation?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
      });
    }

    if (stepId === 'ACCOUNT') {
      return normalizeSetupStep(stepId, {
        completedAt: legacyActivation?.completedAt ?? null,
        detail:
          typeof legacyActivation?.detail === 'string'
            ? `migrated:v1:${legacyActivation.detail}`
            : null,
        status: legacyActivation?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
      });
    }

    if (stepId === 'MODE_SELECT') {
      return normalizeSetupStep(stepId, {
        completedAt: legacyHardwareTest?.completedAt ?? null,
        detail:
          legacyHardwareTest?.status === 'COMPLETED'
            ? 'migrated:v1:mode-live'
            : null,
        status: legacyHardwareTest?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
      });
    }

    return normalizeSetupStep(stepId, null);
  });

  const isAllCompleted = migratedSteps.every((step) => step.status === 'COMPLETED');

  return {
    completedAt:
      isAllCompleted && typeof raw.completedAt === 'string'
        ? raw.completedAt
        : isAllCompleted
          ? now
          : null,
    lastResult: parseSetupResult(raw.lastResult),
    offlineReadinessPassed: isAllCompleted,
    setupMetrics: {
      durationMin: null,
      firstSaleAt: null,
      operatorInterventionCount: 0,
      setupStartAt: now,
    },
    setupVersion: SETUP_VERSION,
    steps: migratedSteps,
  };
}

export function parseSetupState(raw: string | null): SetupState {
  if (!raw) {
    return buildDefaultSetupState();
  }

  try {
    const parsed = JSON.parse(raw) as RawSetupState;
    if (!parsed || typeof parsed !== 'object') {
      return buildDefaultSetupState();
    }

    if (parsed.setupVersion === LEGACY_SETUP_VERSION) {
      return migrateLegacySetupState(parsed);
    }

    if (parsed.setupVersion !== SETUP_VERSION) {
      return buildDefaultSetupState();
    }

    const byStepId = new Map<SetupStepId, SetupStepState>();
    if (Array.isArray(parsed.steps)) {
      for (const entry of parsed.steps) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const step = entry as Partial<SetupStepState>;
        const stepId = SETUP_STEP_ORDER.find((candidate) => candidate === step.stepId);
        if (!stepId) {
          continue;
        }
        byStepId.set(stepId, normalizeSetupStep(stepId, step));
      }
    }

    const steps = SETUP_STEP_ORDER.map((stepId) =>
      byStepId.get(stepId) ?? normalizeSetupStep(stepId, null),
    );
    const isAllCompleted = steps.every((step) => step.status === 'COMPLETED');
    const setupStartFallback =
      typeof parsed.completedAt === 'string' ? parsed.completedAt : new Date().toISOString();
    const setupMetrics = parseSetupMetrics(parsed.setupMetrics, setupStartFallback);

    return {
      completedAt:
        isAllCompleted && typeof parsed.completedAt === 'string'
          ? parsed.completedAt
          : null,
      lastResult: parseSetupResult(parsed.lastResult),
      offlineReadinessPassed: parsed.offlineReadinessPassed === true,
      setupMetrics,
      setupVersion: SETUP_VERSION,
      steps,
    };
  } catch {
    return buildDefaultSetupState();
  }
}

function parseCompanyAccessSnapshot(raw: string | null): CompanyAccessSnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CompanyAccessSnapshot>;
    if (
      !parsed ||
      typeof parsed.companyId !== 'string' ||
      parsed.companyId.trim().length === 0 ||
      typeof parsed.checkedAt !== 'string' ||
      typeof parsed.offlineAccessValidUntil !== 'string' ||
      typeof parsed.summary !== 'string' ||
      typeof parsed.isAccessAllowed !== 'boolean'
    ) {
      return null;
    }

    const status =
      parsed.status === 'ACTIVE' ||
      parsed.status === 'EXPIRED' ||
      parsed.status === 'GRACE' ||
      parsed.status === 'SUSPENDED' ||
      parsed.status === 'UNCONFIGURED'
        ? parsed.status
        : null;
    const reasonCode =
      parsed.reasonCode === 'ACTIVE_SUBSCRIPTION' ||
      parsed.reasonCode === 'COMPANY_DISABLED' ||
      parsed.reasonCode === 'NO_PACKAGE_DATES' ||
      parsed.reasonCode === 'PACKAGE_EXPIRED' ||
      parsed.reasonCode === 'PACKAGE_EXPIRED_GRACE' ||
      parsed.reasonCode === 'PACKAGE_SUSPENDED'
        ? parsed.reasonCode
        : null;
    const operatorAction =
      parsed.operatorAction === 'CHECK_PLAN_DATES' ||
      parsed.operatorAction === 'CONTACT_SUPPORT' ||
      parsed.operatorAction === 'NONE' ||
      parsed.operatorAction === 'RENEW_PACKAGE'
        ? parsed.operatorAction
        : null;

    if (!status || !reasonCode || !operatorAction) {
      return null;
    }

    if (typeof parsed.signature !== 'string') {
      return null;
    }

    const dataToSign = `${parsed.companyId}|${parsed.offlineAccessValidUntil}|${status}`;
    const computedSignature = createHmac('sha256', 'marketpos-offline-license-verification-secret-token-key')
      .update(dataToSign)
      .digest('hex');

    if (computedSignature !== parsed.signature) {
      return null;
    }

    return {
      checkedAt: parsed.checkedAt,
      companyId: parsed.companyId,
      daysRemaining:
        typeof parsed.daysRemaining === 'number' && Number.isFinite(parsed.daysRemaining)
          ? parsed.daysRemaining
          : null,
      expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : null,
      graceEndsAt: typeof parsed.graceEndsAt === 'string' ? parsed.graceEndsAt : null,
      isAccessAllowed: parsed.isAccessAllowed,
      localLastSeenAt:
        typeof parsed.localLastSeenAt === 'string' ? parsed.localLastSeenAt : null,
      offlineAccessGraceDays:
        typeof parsed.offlineAccessGraceDays === 'number' &&
        Number.isFinite(parsed.offlineAccessGraceDays)
          ? parsed.offlineAccessGraceDays
          : 0,
      offlineAccessValidUntil: parsed.offlineAccessValidUntil,
      operatorAction,
      reasonCode,
      status,
      summary: parsed.summary,
      signature: parsed.signature,
    };
  } catch {
    return null;
  }
}

export class LocalDatabaseService {
  private readonly db: Database.Database;
  private readonly databasePath: string;

  public constructor(databasePath: string) {
    this.databasePath = databasePath;
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
    if (!this.getSetting(UI_PRESET_KEY)) {
      this.setSetting(UI_PRESET_KEY, 'market');
    }
    if (!this.getSetting(UI_TOUCH_DENSITY_KEY)) {
      this.setSetting(UI_TOUCH_DENSITY_KEY, 'comfortable');
    }
    if (!this.getSetting(HARDWARE_CONFIG_KEY)) {
      this.setSetting(
        HARDWARE_CONFIG_KEY,
        safeSerializeHardwareConfig(DEFAULT_HARDWARE_CONFIG),
      );
    }
    if (!this.getSetting(BACKUP_POLICY_KEY)) {
      this.setSetting(BACKUP_POLICY_KEY, JSON.stringify(DEFAULT_BACKUP_POLICY));
    }
    if (!this.getSetting(SETUP_STATE_KEY)) {
      this.setSetupState(buildDefaultSetupState());
    }
  }

  public getDatabasePath(): string {
    return this.databasePath;
  }

  public cacheOnlineLogin(payload: CacheLoginPayload): void {
    const now = new Date().toISOString();
    const passwordHash = hashPassword(payload.password);
    const normalizedUsername = payload.user.username.trim();

    this.db.prepare(
      `
      INSERT INTO cached_users (
        id, company_id, branch_id, username, full_name, role, is_active, password_hash, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        company_id = excluded.company_id,
        branch_id = excluded.branch_id,
        username = excluded.username,
        full_name = excluded.full_name,
        role = excluded.role,
        is_active = excluded.is_active,
        password_hash = excluded.password_hash,
        updated_at = excluded.updated_at
      `,
    ).run(
      payload.user.id,
      payload.user.companyId,
      payload.user.branchId,
      normalizedUsername,
      payload.user.fullName,
      payload.user.role,
      passwordHash,
      now,
    );

    this.setSetting(AUTH_USER_ID_KEY, payload.user.id);
    this.setSetting(AUTH_COMPANY_ID_KEY, payload.user.companyId);
    this.setSetting(AUTH_ACCESS_TOKEN_KEY, payload.accessToken);
    this.setSetting(AUTH_REFRESH_TOKEN_KEY, payload.refreshToken);
    this.setSetting(AUTH_REGISTER_ID_KEY, payload.registerId);
    this.setSetting(AUTH_SESSION_ID_KEY, payload.sessionId);
    if (payload.companyAccess) {
      this.setCompanyAccessSnapshot(payload.companyAccess);
    }
  }

  public offlineLogin(username: string, password: string, companyId?: string): OfflineAuthResult | null {
    const normalizedUsername = username.trim();
    const normalizedCompanyId = companyId?.trim();
    const row = this.db.prepare(
      `
      SELECT id, company_id, branch_id, username, full_name, role, is_active, password_hash
      FROM cached_users
      WHERE lower(username) = lower(?)
        AND (? IS NULL OR company_id = ?)
      ORDER BY updated_at DESC
      LIMIT 1
      `,
    ).get(normalizedUsername, normalizedCompanyId ?? null, normalizedCompanyId ?? null) as
      | (CachedUserRow & { password_hash: string | null })
      | undefined;

    if (!row || !row.password_hash) {
      return null;
    }
    if (!verifyPassword(password, row.password_hash)) {
      return null;
    }

    return {
      accessToken: this.getSetting(AUTH_ACCESS_TOKEN_KEY),
      companyAccess: this.getCompanyAccessSnapshot(row.company_id),
      refreshToken: this.getSetting(AUTH_REFRESH_TOKEN_KEY),
      registerId: this.getSetting(AUTH_REGISTER_ID_KEY),
      sessionId: this.getSetting(AUTH_SESSION_ID_KEY),
      user: {
        branchId: row.branch_id,
        companyId: row.company_id,
        fullName: row.full_name,
        id: row.id,
        isActive: row.is_active === 1,
        role: row.role,
        username: row.username,
      },
    };
  }

  public getCachedSession(): OfflineAuthResult | null {
    const userId = this.getSetting(AUTH_USER_ID_KEY);
    if (!userId) {
      return null;
    }

    const row = this.db.prepare(
      `
      SELECT id, company_id, branch_id, username, full_name, role, is_active
      FROM cached_users
      WHERE id = ?
      LIMIT 1
      `,
    ).get(userId) as CachedUserRow | undefined;

    if (!row) {
      return null;
    }

    const registerId = this.ensureStoredUuidSetting(AUTH_REGISTER_ID_KEY);
    const sessionId = this.ensureStoredUuidSetting(AUTH_SESSION_ID_KEY);

    return {
      accessToken: this.getSetting(AUTH_ACCESS_TOKEN_KEY),
      companyAccess: this.getCompanyAccessSnapshot(row.company_id),
      refreshToken: this.getSetting(AUTH_REFRESH_TOKEN_KEY),
      registerId,
      sessionId,
      user: {
        branchId: row.branch_id,
        companyId: row.company_id,
        fullName: row.full_name,
        id: row.id,
        isActive: row.is_active === 1,
        role: row.role,
        username: row.username,
      },
    };
  }

  private ensureStoredUuidSetting(key: string): string {
    const current = this.getSetting(key);
    if (isUuid(current)) {
      return current.trim();
    }
    const generated = randomUUID();
    this.setSetting(key, generated);
    return generated;
  }

  public clearCachedSession(): void {
    this.removeSetting(AUTH_ACCESS_TOKEN_KEY);
    this.removeSetting(AUTH_REFRESH_TOKEN_KEY);
    this.removeSetting(AUTH_USER_ID_KEY);
    this.removeSetting(AUTH_REGISTER_ID_KEY);
    this.removeSetting(AUTH_SESSION_ID_KEY);
  }

  public updateCachedAuthTokens(payload: UpdateAuthTokensPayload): void {
    this.setSetting(AUTH_ACCESS_TOKEN_KEY, payload.accessToken);
    this.setSetting(AUTH_REFRESH_TOKEN_KEY, payload.refreshToken);
    if (payload.companyAccess) {
      this.setCompanyAccessSnapshot(payload.companyAccess);
    }
  }

  public getUiPreset(): UiPreset {
    return normalizeUiPreset(this.getSetting(UI_PRESET_KEY));
  }

  public setUiPreset(preset: UiPreset): void {
    this.setSetting(UI_PRESET_KEY, preset);
  }

  public getTouchDensity(): TouchDensity {
    return normalizeTouchDensity(this.getSetting(UI_TOUCH_DENSITY_KEY));
  }

  public setTouchDensity(density: TouchDensity): void {
    this.setSetting(UI_TOUCH_DENSITY_KEY, density);
  }

  public getHardwareConfig(): HardwareConfig {
    const config = safeParseHardwareConfig(this.getSetting(HARDWARE_CONFIG_KEY));
    return cloneHardwareConfig(config);
  }

  public setHardwareConfig(config: HardwareConfig): void {
    const normalized = safeNormalizeHardwareConfig(config);
    this.setSetting(HARDWARE_CONFIG_KEY, safeSerializeHardwareConfig(normalized));
  }

  public getBackupPolicy(): BackupPolicy {
    return parseBackupPolicy(this.getSetting(BACKUP_POLICY_KEY));
  }

  public setBackupPolicy(policy: BackupPolicy): BackupPolicy {
    const normalized = normalizeBackupPolicy(policy);
    this.setSetting(BACKUP_POLICY_KEY, JSON.stringify(normalized));
    return normalized;
  }

  public markBackupPolicyRun(atIso?: string): BackupPolicy {
    const current = this.getBackupPolicy();
    const candidate =
      typeof atIso === 'string' && Number.isFinite(Date.parse(atIso))
        ? atIso
        : new Date().toISOString();
    return this.setBackupPolicy({
      ...current,
      lastRunAt: candidate,
    });
  }

  public getSetupState(): SetupState {
    return parseSetupState(this.getSetting(SETUP_STATE_KEY));
  }

  public updateSetupStep(payload: SetupStepUpdatePayload): SetupState {
    const current = this.getSetupState();
    const now = new Date().toISOString();
    const steps = current.steps.map((step) => {
      if (step.stepId !== payload.stepId) {
        return step;
      }
      const nextStatus = payload.status;
      return {
        ...step,
        completedAt: nextStatus === 'COMPLETED' ? now : null,
        detail:
          typeof payload.detail === 'string'
            ? payload.detail
            : payload.detail === null
              ? null
              : step.detail,
        status: nextStatus,
      };
    });

    const isAllCompleted = steps.every((step) => step.status === 'COMPLETED');
    const next: SetupState = {
      completedAt: isAllCompleted ? current.completedAt ?? now : null,
      lastResult: current.lastResult,
      offlineReadinessPassed: current.offlineReadinessPassed,
      setupMetrics: current.setupMetrics,
      setupVersion: SETUP_VERSION,
      steps,
    };
    this.setSetupState(next);
    return next;
  }

  public completeSetup(message?: string): SetupState {
    const now = new Date().toISOString();
    const current = this.getSetupState();
    const steps = current.steps.map((step) =>
      step.status === 'COMPLETED'
        ? step
        : { ...step, completedAt: now, status: 'COMPLETED' as const },
    );

    const next: SetupState = {
      completedAt: now,
      lastResult: {
        at: now,
        message:
          typeof message === 'string' && message.trim().length > 0
            ? message.trim()
            : 'Ilk kurulum tamamlandi.',
        status: 'SUCCESS',
      },
      offlineReadinessPassed: current.offlineReadinessPassed,
      setupMetrics: current.setupMetrics,
      setupVersion: SETUP_VERSION,
      steps,
    };
    this.setSetupState(next);
    return next;
  }

  public resetSetup(message?: string): SetupState {
    const now = new Date().toISOString();
    const next = buildDefaultSetupState();
    next.lastResult = {
      at: now,
      message:
        typeof message === 'string' && message.trim().length > 0
          ? message.trim()
          : 'Kurulum sifirlandi.',
      status: 'FAILED',
    };
    this.setSetupState(next);
    return next;
  }

  public setOfflineReadinessPassed(passed: boolean): SetupState {
    const current = this.getSetupState();
    const next: SetupState = {
      ...current,
      offlineReadinessPassed: passed,
    };
    this.setSetupState(next);
    return next;
  }

  public incrementSetupOperatorIntervention(): SetupState {
    const current = this.getSetupState();
    const next: SetupState = {
      ...current,
      setupMetrics: {
        ...current.setupMetrics,
        operatorInterventionCount: current.setupMetrics.operatorInterventionCount + 1,
      },
    };
    this.setSetupState(next);
    return next;
  }

  public markFirstSaleAt(atIso?: string): SetupState {
    const current = this.getSetupState();
    if (current.setupMetrics.firstSaleAt) {
      return current;
    }

    const firstSaleAt =
      typeof atIso === 'string' && Number.isFinite(Date.parse(atIso))
        ? atIso
        : new Date().toISOString();
    const setupStartMs = Date.parse(current.setupMetrics.setupStartAt);
    const firstSaleMs = Date.parse(firstSaleAt);
    const durationMin =
      Number.isFinite(setupStartMs) && Number.isFinite(firstSaleMs)
        ? Math.max(0, Math.round(((firstSaleMs - setupStartMs) / 60000) * 100) / 100)
        : null;

    const next: SetupState = {
      ...current,
      setupMetrics: {
        ...current.setupMetrics,
        durationMin,
        firstSaleAt,
      },
    };
    this.setSetupState(next);
    return next;
  }

  public setCompanyAccessSnapshot(snapshot: CompanyAccessSnapshot): void {
    if (!snapshot.companyId || snapshot.companyId.trim().length === 0) {
      return;
    }
    this.setSetting(
      this.getCompanyAccessSettingKey(snapshot.companyId),
      JSON.stringify(snapshot),
    );
  }

  public getCompanyAccessSnapshot(companyId: string): CompanyAccessSnapshot | null {
    if (!companyId || companyId.trim().length === 0) {
      return null;
    }
    return parseCompanyAccessSnapshot(
      this.getSetting(this.getCompanyAccessSettingKey(companyId)),
    );
  }

  public saveLastReceiptPayload(payload: StoredReceiptPayload): void {
    if (payload.lines.length === 0) {
      return;
    }
    this.setSetting(
      LAST_RECEIPT_PAYLOAD_KEY,
      JSON.stringify({
        copyCount: payload.copyCount,
        lines: payload.lines,
      }),
    );
  }

  public getLastReceiptPayload(): StoredReceiptPayload | null {
    const raw = this.getSetting(LAST_RECEIPT_PAYLOAD_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as StoredReceiptPayload;
      if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) {
        return null;
      }
      const lines = parsed.lines
        .filter((line) => typeof line === 'string')
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        return null;
      }
      return {
        copyCount:
          typeof parsed.copyCount === 'number' && Number.isFinite(parsed.copyCount)
            ? parsed.copyCount
            : undefined,
        lines,
      };
    } catch {
      return null;
    }
  }

  public verifyManagerUnlock(payload: {
    companyId?: string;
    password?: string;
    pin?: string;
    username?: string;
  }): ManagerUnlockResult {
    const pinHash = this.getSetting(MANAGER_UNLOCK_PIN_HASH_KEY);
    if (pinHash) {
      if (!payload.pin || !verifyPassword(payload.pin, pinHash)) {
        throw new Error('Yonetici PIN dogrulamasi basarisiz.');
      }
      const manager = this.resolveManagerUser(payload.username, payload.companyId);
      return {
        method: 'PIN',
        requiresPinSetup: false,
        user: manager,
      };
    }

    if (!payload.password) {
      throw new Error('Yonetici PIN tanimli degil. Sifre ile onaylayin.');
    }
    const managerWithHash = this.resolveManagerUserWithHash(payload.username, payload.companyId);
    if (!managerWithHash.passwordHash) {
      throw new Error('Yonetici bu cihazda daha once online dogrulanmamis.');
    }
    if (!verifyPassword(payload.password, managerWithHash.passwordHash)) {
      throw new Error('Yonetici sifre dogrulamasi basarisiz.');
    }

    return {
      method: 'PASSWORD',
      requiresPinSetup: true,
      user: managerWithHash.user,
    };
  }

  public setManagerPin(pin: string): void {
    if (!/^\d{4}$/u.test(pin)) {
      throw new Error('Yonetici PIN 4 haneli olmalidir.');
    }
    this.setSetting(MANAGER_UNLOCK_PIN_HASH_KEY, hashPassword(pin));
    this.setSetting(MANAGER_UNLOCK_PIN_UPDATED_AT_KEY, new Date().toISOString());
  }

  public upsertSyncData(payload: UpsertSyncDataPayload): void {
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      const upsertUser = this.db.prepare(
        `
        INSERT INTO cached_users (
          id, company_id, branch_id, username, full_name, role, is_active, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_id = excluded.company_id,
          branch_id = excluded.branch_id,
          username = excluded.username,
          full_name = excluded.full_name,
          role = excluded.role,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
        `,
      );
      const upsertCategory = this.db.prepare(
        `
        INSERT INTO cached_categories (
          id, company_id, name, parent_id, sort_order, color, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_id = excluded.company_id,
          name = excluded.name,
          parent_id = excluded.parent_id,
          sort_order = excluded.sort_order,
          color = excluded.color,
          updated_at = excluded.updated_at
        `,
      );
      const upsertProduct = this.db.prepare(
        `
        INSERT INTO cached_products (
          id, company_id, category_id, supplier_id, supplier_name, barcode, name, brand, description,
          purchase_price, sale_price, wholesale_price, vat_rate, stock_level, is_quick_access,
          quick_access_color, quick_access_order, campaign_json, expiry_date, is_active, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_id = excluded.company_id,
          category_id = excluded.category_id,
          supplier_id = excluded.supplier_id,
          supplier_name = excluded.supplier_name,
          barcode = excluded.barcode,
          name = excluded.name,
          brand = excluded.brand,
          description = excluded.description,
          purchase_price = excluded.purchase_price,
          sale_price = excluded.sale_price,
          wholesale_price = excluded.wholesale_price,
          vat_rate = excluded.vat_rate,
          stock_level = COALESCE(excluded.stock_level, cached_products.stock_level),
          is_quick_access = excluded.is_quick_access,
          quick_access_color = excluded.quick_access_color,
          quick_access_order = excluded.quick_access_order,
          campaign_json = excluded.campaign_json,
          expiry_date = excluded.expiry_date,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
        `,
      );
      const upsertSupplier = this.db.prepare(
        `
        INSERT INTO cached_suppliers (
          id, company_id, name, balance, phone, tax_number, is_active, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          balance = excluded.balance,
          phone = excluded.phone,
          tax_number = excluded.tax_number,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
        `,
      );
      const upsertInvoice = this.db.prepare(
        `
        INSERT INTO cached_purchase_invoices (
          id, company_id, branch_id, supplier_id, invoice_number, document_type, dispatch_number,
          document_date, due_date, source_dispatch_id, converted_to_invoice_id, converted_at,
          subtotal, total_vat, total_discount, grand_total, total_grand_total, status,
          invoice_date, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          invoice_number = excluded.invoice_number,
          document_type = excluded.document_type,
          dispatch_number = excluded.dispatch_number,
          document_date = excluded.document_date,
          due_date = excluded.due_date,
          source_dispatch_id = excluded.source_dispatch_id,
          converted_to_invoice_id = excluded.converted_to_invoice_id,
          converted_at = excluded.converted_at,
          subtotal = excluded.subtotal,
          total_vat = excluded.total_vat,
          total_discount = excluded.total_discount,
          grand_total = excluded.grand_total,
          total_grand_total = excluded.total_grand_total,
          status = excluded.status,
          invoice_date = excluded.invoice_date,
          created_at = COALESCE(cached_purchase_invoices.created_at, excluded.created_at),
          updated_at = excluded.updated_at
        `,
      );
      const upsertPurchaseInvoiceItemStmt = this.db.prepare(
        `
        INSERT INTO cached_purchase_invoice_items (
          id, purchase_invoice_id, product_id, quantity, unit_price, vat_amount, discount, line_total, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          quantity = excluded.quantity,
          unit_price = excluded.unit_price,
          vat_amount = excluded.vat_amount,
          discount = excluded.discount,
          line_total = excluded.line_total,
          updated_at = excluded.updated_at
        `,
      );
      const upsertBundle = this.db.prepare(
        `
        INSERT INTO cached_bundles (
          id, company_id, name, product_ids_json, bundle_price, is_active, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_id = excluded.company_id,
          name = excluded.name,
          product_ids_json = excluded.product_ids_json,
          bundle_price = excluded.bundle_price,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
        `,
      );
      const upsertCustomer = this.db.prepare(
        `
        INSERT INTO cached_customers (
          id, company_id, full_name, phone, email, tax_number, address, balance, loyalty_points, price_tier, is_active, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          full_name = excluded.full_name,
          phone = excluded.phone,
          email = excluded.email,
          tax_number = excluded.tax_number,
          address = excluded.address,
          balance = excluded.balance,
          loyalty_points = excluded.loyalty_points,
          price_tier = excluded.price_tier,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
        `,
      );

      for (const user of payload.users) {
        upsertUser.run(
          user.id,
          user.companyId,
          user.branchId,
          user.username,
          user.fullName,
          user.role,
          user.isActive ? 1 : 0,
          now,
        );
      }
      for (const category of payload.categories) {
        upsertCategory.run(
          category.id,
          category.companyId,
          category.name,
          category.parentId,
          category.sortOrder,
          category.color,
          now,
        );
      }
      for (const product of payload.products) {
        upsertProduct.run(
          product.id,
          product.companyId,
          product.categoryId,
          product.supplierId ?? null,
          product.supplierName ?? null,
          product.barcode,
          product.name,
          product.brand ?? null,
          product.description ?? null,
          readFiniteNumber((product as unknown as Record<string, unknown>).purchasePrice) ?? 0,
          product.salePrice,
          product.wholesalePrice ?? null,
          product.vatRate,
          product.stockLevel,
          product.isQuickAccess ? 1 : 0,
          product.quickAccessColor,
          product.quickAccessOrder,
          product.campaign ? JSON.stringify(product.campaign) : null,
          product.expiryDate ?? null,
          product.isActive ? 1 : 0,
          now,
        );
      }
      for (const supplier of payload.suppliers) {
        upsertSupplier.run(
          supplier.id,
          supplier.companyId,
          supplier.name,
          supplier.balance ?? 0,
          supplier.phone ?? null,
          supplier.taxNumber ?? null,
          supplier.isActive ? 1 : 0,
          now,
        );
      }
      for (const invoice of payload.purchaseInvoices) {
        const grandTotal = readFiniteNumber((invoice as unknown as Record<string, unknown>).grandTotal)
          ?? readFiniteNumber((invoice as unknown as Record<string, unknown>).totalGrandTotal)
          ?? 0;
        const documentDate =
          (invoice as unknown as Record<string, unknown>).documentDate as string | undefined
          ?? (invoice as unknown as Record<string, unknown>).invoiceDate as string | undefined
          ?? now;
        upsertInvoice.run(
          invoice.id,
          invoice.companyId,
          invoice.branchId,
          invoice.supplierId,
          invoice.invoiceNumber,
          (invoice as unknown as Record<string, unknown>).documentType ?? 'INVOICE',
          (invoice as unknown as Record<string, unknown>).dispatchNumber ?? null,
          documentDate,
          (invoice as unknown as Record<string, unknown>).dueDate ?? null,
          (invoice as unknown as Record<string, unknown>).sourceDispatchId ?? null,
          (invoice as unknown as Record<string, unknown>).convertedToInvoiceId ?? null,
          (invoice as unknown as Record<string, unknown>).convertedAt ?? null,
          readFiniteNumber((invoice as unknown as Record<string, unknown>).subtotal) ?? 0,
          readFiniteNumber((invoice as unknown as Record<string, unknown>).totalVat) ?? 0,
          readFiniteNumber((invoice as unknown as Record<string, unknown>).totalDiscount) ?? 0,
          grandTotal,
          grandTotal,
          invoice.status,
          documentDate,
          (invoice as unknown as Record<string, unknown>).createdAt ?? now,
          now,
        );
        for (const item of invoice.items) {
          upsertPurchaseInvoiceItemStmt.run(
            item.id,
            item.purchaseInvoiceId ?? (item as unknown as Record<string, unknown>).invoiceId,
            item.productId,
            item.quantity,
            item.unitPrice,
            readFiniteNumber((item as unknown as Record<string, unknown>).vatAmount) ?? 0,
            readFiniteNumber((item as unknown as Record<string, unknown>).discount) ?? 0,
            item.lineTotal,
            now,
          );
        }
      }
      if (payload.bundles) {
        for (const bundle of payload.bundles) {
          upsertBundle.run(
            bundle.id,
            bundle.companyId,
            bundle.name,
            JSON.stringify(bundle.productIds),
            bundle.bundlePrice,
            bundle.isActive ? 1 : 0,
            bundle.updatedAt || now
          );
        }
      }
      if (payload.customers) {
        for (const customer of payload.customers) {
          upsertCustomer.run(
            customer.id,
            customer.companyId,
            customer.fullName || customer.name,
            customer.phone ?? null,
            customer.email ?? null,
            customer.taxNumber ?? null,
            customer.address ?? null,
            customer.balance ?? 0,
            customer.loyaltyPoints ?? 0,
            customer.priceTier || 'RETAIL',
            customer.isActive ? 1 : 0,
            now,
          );
        }
      }
    });

    try {
      tx();
    } catch (error: unknown) {
      if (!this.isSqliteMalformedError(error)) {
        throw error;
      }
      this.rebuildProductsFtsIndex();
      tx();
    }
  }

  public listCachedProducts(options: ListCachedProductsOptions): CachedProductRecord[] {
    const searchPredicate = options.search ? 'AND p.rowid IN (SELECT rowid FROM products_fts WHERE products_fts MATCH ?)' : '';
    const loadRows = () =>
      this.db.prepare(
      `
      WITH local_stock_impact AS (
        -- Calculate impact from pending sales
        SELECT 
          json_each.value->>'$.productId' as product_id,
          SUM(json_each.value->>'$.quantity') as sold_qty
        FROM local_sales, json_each(payload_data->'$.items')
        WHERE sync_status IN ('PENDING', 'FAILED')
        GROUP BY 1
        
        UNION ALL
        
        -- Calculate impact from pending refunds (adds back to stock)
        SELECT 
          json_each.value->>'$.productId' as product_id,
          -SUM(json_each.value->>'$.quantity') as sold_qty
        FROM local_refunds, json_each(payload_data->'$.items')
        WHERE sync_status IN ('PENDING', 'FAILED')
        GROUP BY 1
      )
      SELECT 
        p.id, p.company_id, p.category_id, p.supplier_id, COALESCE(p.supplier_name, s.name) AS supplier_name,
        p.barcode, p.name, p.brand, p.description, p.purchase_price, p.sale_price, p.wholesale_price, p.vat_rate,
        p.is_quick_access, p.quick_access_color, p.quick_access_order, p.is_active,
        p.stock_level, p.campaign_json, p.expiry_date,
        p.stock_level - COALESCE((SELECT SUM(sold_qty) FROM local_stock_impact WHERE product_id = p.id), 0) as estimated_stock
      FROM cached_products p
      LEFT JOIN cached_suppliers s ON s.id = p.supplier_id
      WHERE p.company_id = ?
        AND p.is_active = 1
        AND (? IS NULL OR p.category_id = ?)
        AND (? = 0 OR p.is_quick_access = 1)
        ${searchPredicate}
      ORDER BY COALESCE(p.quick_access_order, 999999), p.name ASC
      `,
    ).all(
      ...[
        options.companyId,
        options.categoryId ?? null,
        options.categoryId ?? null,
        options.quickAccessOnly ? 1 : 0,
        ...(options.search ? [`${options.search}*`] : []),
      ]
    ) as CachedProductRow[];

    let rows: CachedProductRow[];
    try {
      rows = loadRows();
    } catch (error: unknown) {
      if (!this.isSqliteMalformedError(error)) {
        throw error;
      }
      this.rebuildProductsFtsIndex();
      rows = loadRows();
    }

    return rows.map((row) => ({
      barcode: row.barcode,
      brand: row.brand,
      campaign: (() => {
        if (!row.campaign_json) {
          return null;
        }
        try {
          const parsed = JSON.parse(row.campaign_json) as Record<string, unknown>;
          return parsed;
        } catch {
          return null;
        }
      })(),
      categoryId: row.category_id,
      companyId: row.company_id,
      description: row.description,
      expiryDate: row.expiry_date,
      id: row.id,
      isActive: row.is_active === 1,
      isQuickAccess: row.is_quick_access === 1,
      name: row.name,
      purchasePrice: row.purchase_price,
      quickAccessColor: row.quick_access_color,
      quickAccessOrder: row.quick_access_order,
      salePrice: row.sale_price,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      wholesalePrice: row.wholesale_price,
      vatRate: row.vat_rate,
      stockLevel: row.stock_level,
      estimatedStock: row.estimated_stock,
    }));
  }

  private isSqliteMalformedError(error: unknown): boolean {
    const message = readErrorMessage(error).toLowerCase();
    return message.includes('database disk image is malformed');
  }

  private rebuildProductsFtsIndex(): void {
    this.db.exec(`
      DROP TRIGGER IF EXISTS trg_products_ai;
      DROP TRIGGER IF EXISTS trg_products_ad;
      DROP TRIGGER IF EXISTS trg_products_au;
      DROP TABLE IF EXISTS products_fts;
      CREATE VIRTUAL TABLE products_fts USING fts5(
        barcode,
        name,
        content='cached_products',
        content_rowid='rowid'
      );
      CREATE TRIGGER trg_products_ai AFTER INSERT ON cached_products BEGIN
        INSERT INTO products_fts(rowid, barcode, name) VALUES (new.rowid, new.barcode, new.name);
      END;
      CREATE TRIGGER trg_products_ad AFTER DELETE ON cached_products BEGIN
        INSERT INTO products_fts(products_fts, rowid, barcode, name) VALUES('delete', old.rowid, old.barcode, old.name);
      END;
      CREATE TRIGGER trg_products_au AFTER UPDATE ON cached_products BEGIN
        INSERT INTO products_fts(products_fts, rowid, barcode, name) VALUES('delete', old.rowid, old.barcode, old.name);
        INSERT INTO products_fts(rowid, barcode, name) VALUES (new.rowid, new.barcode, new.name);
      END;
      INSERT INTO products_fts(rowid, barcode, name)
      SELECT rowid, barcode, name FROM cached_products;
    `);
  }

  public listCachedCategories(companyId: string): CachedCategoryRecord[] {
    const rows = this.db.prepare(
      `
      SELECT id, company_id, name, parent_id, sort_order, color
      FROM cached_categories
      WHERE company_id = ?
      ORDER BY sort_order ASC, name ASC
      `,
    ).all(companyId) as CachedCategoryRow[];

    return rows.map((row) => ({
      color: row.color,
      companyId: row.company_id,
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      sortOrder: row.sort_order,
    }));
  }

  public listCachedSuppliers(companyId: string): CachedSupplierRecord[] {
    const rows = this.db.prepare(
      `
      SELECT id, company_id, name, balance, phone, tax_number, is_active
      FROM cached_suppliers
      WHERE company_id = ?
      ORDER BY name ASC
      `,
    ).all(companyId) as CachedSupplierRow[];

    return rows.map((row) => ({
      balance: row.balance ?? 0,
      companyId: row.company_id,
      id: row.id,
      isActive: row.is_active === 1,
      name: row.name,
      phone: row.phone,
      taxNumber: row.tax_number,
    }));
  }

  public listCachedPurchaseInvoices(params: {
    branchId: string;
    companyId: string;
    documentType?: 'DISPATCH' | 'INVOICE' | 'ORDER';
    limit?: number;
    page?: number;
    supplierId?: string;
  }): {
    data: (CachedPurchaseInvoiceRecord & { items: CachedPurchaseInvoiceItemRecord[] })[];
    pagination: { limit: number; page: number; total: number; totalPages: number };
  } {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(200, params.limit ?? 50));
    const offset = (page - 1) * limit;

    const whereSql = `
      company_id = @companyId
      AND branch_id = @branchId
      AND (@supplierId IS NULL OR supplier_id = @supplierId)
      AND (@documentType IS NULL OR document_type = @documentType)
    `;

    const bindings = {
      branchId: params.branchId,
      companyId: params.companyId,
      documentType: params.documentType ?? null,
      supplierId: params.supplierId ?? null,
    };

    const totalRow = this.db
      .prepare(
        `
        SELECT COUNT(1) AS total
        FROM cached_purchase_invoices
        WHERE ${whereSql}
        `,
      )
      .get(bindings) as { total: number };
    const total = totalRow?.total ?? 0;

    const rows = this.db
      .prepare(
        `
        SELECT
          id,
          company_id,
          branch_id,
          supplier_id,
          invoice_number,
          document_type,
          dispatch_number,
          document_date,
          due_date,
          source_dispatch_id,
          converted_to_invoice_id,
          converted_at,
          subtotal,
          total_vat,
          total_discount,
          grand_total,
          total_grand_total,
          status,
          invoice_date,
          created_at,
          updated_at
        FROM cached_purchase_invoices
        WHERE ${whereSql}
        ORDER BY COALESCE(document_date, invoice_date, created_at, updated_at) DESC
        LIMIT @limit OFFSET @offset
        `,
      )
      .all({
        ...bindings,
        limit,
        offset,
      }) as CachedPurchaseInvoiceRow[];

    const invoiceIds = rows.map((row) => row.id);
    const itemsByInvoiceId = new Map<string, CachedPurchaseInvoiceItemRecord[]>();
    if (invoiceIds.length > 0) {
      const placeholders = invoiceIds.map(() => '?').join(', ');
      const itemRows = this.db
        .prepare(
          `
          SELECT
            id,
            purchase_invoice_id,
            product_id,
            quantity,
            unit_price,
            vat_amount,
            discount,
            line_total,
            updated_at
          FROM cached_purchase_invoice_items
          WHERE purchase_invoice_id IN (${placeholders})
          ORDER BY updated_at DESC
          `,
        )
        .all(...invoiceIds) as CachedPurchaseInvoiceItemRow[];

      for (const row of itemRows) {
        const mapped: CachedPurchaseInvoiceItemRecord = {
          discount: row.discount ?? 0,
          id: row.id,
          lineTotal: row.line_total,
          productId: row.product_id,
          purchaseInvoiceId: row.purchase_invoice_id,
          quantity: row.quantity,
          unitPrice: row.unit_price,
          vatAmount: row.vat_amount ?? 0,
        };
        const list = itemsByInvoiceId.get(row.purchase_invoice_id);
        if (list) {
          list.push(mapped);
        } else {
          itemsByInvoiceId.set(row.purchase_invoice_id, [mapped]);
        }
      }
    }

    const data = rows.map(
      (row): CachedPurchaseInvoiceRecord & { items: CachedPurchaseInvoiceItemRecord[] } => {
        const grandTotal = row.grand_total ?? row.total_grand_total ?? 0;
        const documentDate = row.document_date ?? row.invoice_date ?? row.created_at ?? row.updated_at;
        return {
          branchId: row.branch_id,
          createdAt: row.created_at ?? documentDate,
          updatedAt: row.updated_at ?? documentDate,
          companyId: row.company_id,
          convertedAt: row.converted_at,
          convertedToInvoiceId: row.converted_to_invoice_id,
          dispatchNumber: row.dispatch_number,
          documentDate,
          documentType:
            row.document_type === 'ORDER' ||
            row.document_type === 'DISPATCH' ||
            row.document_type === 'INVOICE'
              ? row.document_type
              : 'INVOICE',
          dueDate: row.due_date,
          grandTotal,
          id: row.id,
          invoiceDate: documentDate,
          invoiceNumber: row.invoice_number,
          items: itemsByInvoiceId.get(row.id) ?? [],
          sourceDispatchId: row.source_dispatch_id,
          status: row.status,
          subtotal: row.subtotal ?? 0,
          supplierId: row.supplier_id,
          totalDiscount: row.total_discount ?? 0,
          totalGrandTotal: grandTotal,
          totalVat: row.total_vat ?? 0,
        };
      },
    );

    return {
      data,
      pagination: {
        limit,
        page,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 1,
      },
    };
  }


  public getBackofficeSettings(): BackofficeSettings {
    const raw = this.getSetting(BACKOFFICE_SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_BACKOFFICE_SETTINGS };
    }
    try {
      return normalizeBackofficeSettings(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_BACKOFFICE_SETTINGS };
    }
  }

  public setBackofficeSettings(payload: SetBackofficeSettingsPayload): BackofficeSettings {
    const current = this.getBackofficeSettings();
    const next = mergeBackofficeSettings(current, payload.patch);
    this.setSetting(BACKOFFICE_SETTINGS_KEY, JSON.stringify(next));
    this.logSecurityEvent({
      eventType: 'BACKOFFICE_SETTINGS_UPDATED',
      message: 'Desktop backoffice ayarlari guncellendi.',
      metadataJson: JSON.stringify({
        next,
        previous: current,
      }),
      operatorUserId: payload.operatorUserId ?? null,
      severity: 'INFO',
    });
    return next;
  }

  private getNextReceiptNumber(): string {
    const key = 'last_receipt_sequence';
    const current = this.getSetting(key);
    const nextValue = (current ? parseInt(current, 10) : 0) + 1;
    this.setSetting(key, String(nextValue));
    return String(nextValue).padStart(6, '0');
  }

  public queueSale(sale: unknown, localId?: string): PendingSaleRecord {
    const normalizedSale = normalizeQueuedSalePayload(sale);
    const saleCandidate = isRecord(normalizedSale)
      ? {
          ...normalizedSale,
          registerId: this.resolveOfflineRegisterId(normalizedSale.registerId),
          sessionId: this.resolveOfflineSessionId(normalizedSale.sessionId),
        }
      : normalizedSale;
    const parsedSale = createSaleSchema.parse(saleCandidate) as any;
    let localReceipt = isRecord(saleCandidate) ? (saleCandidate as any).localReceiptNumber : undefined;
    if (typeof localReceipt === 'string' && localReceipt.startsWith('YEREL-')) {
      localReceipt = this.getNextReceiptNumber();
    }
    parsedSale.localReceiptNumber = localReceipt;
    const record = this.queuePayload('local_sales', parsedSale, localId);
    
    // Apply loyalty points logic
    if (isRecord(parsedSale) && typeof parsedSale.customerId === 'string') {
      const totalAmount = Array.isArray(parsedSale.payments)
        ? parsedSale.payments.reduce((sum, payment) => sum + (readFiniteNumber(payment.amount) ?? 0), 0)
        : 0;
      if (totalAmount > 0) {
        const pointsEarned = Math.floor(totalAmount * 0.01); // 1% points
        if (pointsEarned > 0) {
          try {
            this.updateCustomerLoyaltyPoints(parsedSale.customerId, pointsEarned);
          } catch {
            // Non-critical local cache projection failure
          }
        }
      }
    }
    
    return record;
  }

  public queueRefund(refund: unknown, localId?: string): PendingRefundRecord {
    const refundCandidate = isRecord(refund)
      ? {
          ...refund,
          registerId: this.resolveOfflineRegisterId(refund.registerId),
          sessionId: this.resolveOfflineSessionId(refund.sessionId),
        }
      : refund;
    createRefundSchema.parse(refundCandidate);
    const record = this.queuePayload('local_refunds', refundCandidate, localId);
    
    // Deduct loyalty points logic
    if (isRecord(refund) && typeof refund.customerId === 'string') {
      const totalAmount = readFiniteNumber(refund.totalAmount) ?? 0;
      if (totalAmount > 0) {
        const pointsDeducted = Math.floor(totalAmount * 0.01);
        try {
          this.updateCustomerLoyaltyPoints(refund.customerId, -pointsDeducted);
        } catch {
          // Non-critical
        }
      }
    }
    
    return record;
  }

  private resolveOfflineRegisterId(candidate: unknown): string {
    if (isUuid(candidate)) {
      const normalized = candidate.trim();
      this.setSetting(AUTH_REGISTER_ID_KEY, normalized);
      return normalized;
    }

    const cached = this.getSetting(AUTH_REGISTER_ID_KEY);
    if (isUuid(cached)) {
      return cached.trim();
    }

    const history = this.findLatestUuidFromQueuePayload('registerId');
    if (history) {
      this.setSetting(AUTH_REGISTER_ID_KEY, history);
      return history;
    }

    const generated = randomUUID();
    this.setSetting(AUTH_REGISTER_ID_KEY, generated);
    return generated;
  }

  private resolveOfflineSessionId(candidate: unknown): string {
    if (isUuid(candidate)) {
      const normalized = candidate.trim();
      this.setSetting(AUTH_SESSION_ID_KEY, normalized);
      return normalized;
    }

    const cached = this.getSetting(AUTH_SESSION_ID_KEY);
    if (isUuid(cached)) {
      return cached.trim();
    }

    const history = this.findLatestUuidFromQueuePayload('sessionId');
    if (history) {
      this.setSetting(AUTH_SESSION_ID_KEY, history);
      return history;
    }

    const generated = randomUUID();
    this.setSetting(AUTH_SESSION_ID_KEY, generated);
    return generated;
  }

  private findLatestUuidFromQueuePayload(
    field: 'registerId' | 'sessionId',
  ): string | null {
    const tables = ['local_sales', 'local_refunds'] as const;
    for (const table of tables) {
      const rows = this.db.prepare(
        `
        SELECT payload_data
        FROM ${table}
        ORDER BY updated_at DESC
        LIMIT 200
        `,
      ).all() as Array<{ payload_data: string }>;

      for (const row of rows) {
        try {
          const payload = JSON.parse(row.payload_data) as Record<string, unknown>;
          const value = payload[field];
          if (isUuid(value)) {
            return value.trim();
          }
        } catch {
          // ignore malformed historical payload rows
        }
      }
    }
    return null;
  }

  private updateCustomerLoyaltyPoints(customerId: string, pointsDelta: number): void {
    this.db.prepare(
      `
      UPDATE cached_customers 
      SET loyalty_points = loyalty_points + ?, updated_at = ?
      WHERE id = ?
      `,
    ).run(pointsDelta, new Date().toISOString(), customerId);
  }

  public listPendingSales(limit = 200): PendingSaleRecord[] {
    return this.listPendingQueue('local_sales', limit).map((row) => toPendingRecord(row));
  }

  public listPendingRefunds(limit = 200): PendingRefundRecord[] {
    return this.listPendingQueue('local_refunds', limit).map((row) => toPendingRecord(row));
  }

  public queueProductOp(payload: unknown, opType: ProductOpType, localId?: string): ProductOpQueueRecord {
    if (opType === 'CREATE') {
      createProductSchema.parse(payload);
    } else if (opType === 'UPDATE') {
      updateProductSchema.parse(payload);
    }
    const targetTable = this.resolveOperationTableFromPayload(payload);
    const record = this.queueOperationPayload(targetTable, payload, opType, localId);
    if (opType === 'CREATE' || opType === 'UPDATE') {
      try {
        this.applyQueuedProductOperation(payload);
      } catch {
        // Keep queue durability even if local cache projection fails.
      }
    }
    return record;
  }

  public listPendingProductOps(limit = 200): ProductOpQueueRecord[] {
    return this.listPendingOperationQueue('local_product_ops', limit).map((row) =>
      toPendingOperationRecord<ProductOpType>(row),
    );
  }

  public listPendingSupplierOps(limit = 200): SupplierOpQueueRecord[] {
    return this.listPendingOperationQueue('local_supplier_ops', limit).map((row) =>
      toPendingOperationRecord<SupplierOpType>(row),
    );
  }

  public listPendingPurchaseOps(limit = 200): PurchaseOpQueueRecord[] {
    return this.listPendingOperationQueue('local_purchase_ops', limit).map((row) =>
      toPendingOperationRecord<PurchaseOpType>(row),
    );
  }

  public markProductOpsSynced(ids: string[]): number {
    return this.markQueueSynced('local_product_ops', ids);
  }

  public markSupplierOpsSynced(ids: string[]): number {
    return this.markQueueSynced('local_supplier_ops', ids);
  }

  public markPurchaseOpsSynced(ids: string[]): number {
    return this.markQueueSynced('local_purchase_ops', ids);
  }

  public markProductOpFailed(id: string, errorMessage: string): number {
    return this.markQueueFailed('local_product_ops', id, errorMessage);
  }

  public markSupplierOpFailed(id: string, errorMessage: string): number {
    return this.markQueueFailed('local_supplier_ops', id, errorMessage);
  }

  public markPurchaseOpFailed(id: string, errorMessage: string): number {
    return this.markQueueFailed('local_purchase_ops', id, errorMessage);
  }

  public queueStockOp(payload: unknown, opType: StockOpType, localId?: string): StockOpQueueRecord {
    if (opType === 'MOVEMENT') {
      createStockMovementSchema.parse(payload);
    }
    return this.queueOperationPayload('local_stock_ops', payload, opType, localId);
  }

  public listPendingStockOps(limit = 200): StockOpQueueRecord[] {
    return this.listPendingOperationQueue('local_stock_ops', limit).map((row) =>
      toPendingOperationRecord<StockOpType>(row),
    );
  }

  public markStockOpsSynced(ids: string[]): number {
    return this.markQueueSynced('local_stock_ops', ids);
  }

  public markStockOpFailed(id: string, errorMessage: string): number {
    return this.markQueueFailed('local_stock_ops', id, errorMessage);
  }

  public markSalesSynced(ids: string[]): number {
    return this.markQueueSynced('local_sales', ids);
  }

  public markRefundsSynced(ids: string[]): number {
    return this.markQueueSynced('local_refunds', ids);
  }

  public markSaleFailed(id: string, errorMessage: string): number {
    return this.markQueueFailed('local_sales', id, errorMessage);
  }

  public markRefundFailed(id: string, errorMessage: string): number {
    return this.markQueueFailed('local_refunds', id, errorMessage);
  }

  public listPendingCustomerOps(limit = 200): CustomerOpQueueRecord[] {
    return this.listPendingOperationQueue('local_customer_ops', limit).map((row) =>
      toPendingOperationRecord<CustomerOpType>(row),
    );
  }

  public markCustomerOpsSynced(ids: string[]): number {
    return this.markQueueSynced('local_customer_ops', ids);
  }

  public markCustomerOpFailed(id: string, errorMessage: string): number {
    return this.markQueueFailed('local_customer_ops', id, errorMessage);
  }

  public retryQueueRecord(entity: string, id: string): boolean {
    const table = this.resolveTableFromEntity(entity);
    const now = new Date().toISOString();
    const result = this.db.prepare(
      `UPDATE ${table} SET sync_status = 'PENDING', sync_error = NULL, failure_count = 0, updated_at = ? WHERE id = ?`
    ).run(now, id);
    return Number(result.changes ?? 0) > 0;
  }

  public deleteQueueRecord(entity: string, id: string): boolean {
    const table = this.resolveTableFromEntity(entity);
    const result = this.db.prepare(
      `DELETE FROM ${table} WHERE id = ?`
    ).run(id);
    return Number(result.changes ?? 0) > 0;
  }

  private resolveTableFromEntity(entity: string): string {
    switch (entity) {
      case 'sales': return 'local_sales';
      case 'refunds': return 'local_refunds';
      case 'customerOps': return 'local_customer_ops';
      case 'productOps': return 'local_product_ops';
      case 'supplierOps': return 'local_supplier_ops';
      case 'purchaseOps': return 'local_purchase_ops';
      case 'stockOps': return 'local_stock_ops';
      default: throw new Error(`Gecersiz entity tipi: ${entity}`);
    }
  }

  public getQueueCounts(): {
    customerOps: number;
    productOps: number;
    purchaseOps: number;
    refunds: number;
    sales: number;
    stockOps: number;
    supplierOps: number;
  } {
    const sales = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_sales WHERE sync_status IN ('PENDING','FAILED')`,
    ).get() as { total: number };
    const refunds = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_refunds WHERE sync_status IN ('PENDING','FAILED')`,
    ).get() as { total: number };
    const productOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_product_ops WHERE sync_status IN ('PENDING','FAILED')`,
    ).get() as { total: number };
    const supplierOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_supplier_ops WHERE sync_status IN ('PENDING','FAILED')`,
    ).get() as { total: number };
    const purchaseOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_purchase_ops WHERE sync_status IN ('PENDING','FAILED')`,
    ).get() as { total: number };
    const stockOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_stock_ops WHERE sync_status IN ('PENDING','FAILED')`,
    ).get() as { total: number };
    const customerOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_customer_ops WHERE sync_status IN ('PENDING','FAILED')`,
    ).get() as { total: number };
    return {
      customerOps: customerOps.total,
      productOps: productOps.total,
      purchaseOps: purchaseOps.total,
      refunds: refunds.total,
      sales: sales.total,
      stockOps: stockOps.total,
      supplierOps: supplierOps.total,
    };
  }

  private getOldestPendingCreatedAt(): string | null {
    const row = this.db.prepare(
      `
      SELECT MIN(created_at) as oldest
      FROM (
        SELECT created_at FROM local_sales WHERE sync_status IN ('PENDING','FAILED')
        UNION ALL
        SELECT created_at FROM local_refunds WHERE sync_status IN ('PENDING','FAILED')
        UNION ALL
        SELECT created_at FROM local_product_ops WHERE sync_status IN ('PENDING','FAILED')
        UNION ALL
        SELECT created_at FROM local_supplier_ops WHERE sync_status IN ('PENDING','FAILED')
        UNION ALL
        SELECT created_at FROM local_purchase_ops WHERE sync_status IN ('PENDING','FAILED')
        UNION ALL
        SELECT created_at FROM local_stock_ops WHERE sync_status IN ('PENDING','FAILED')
        UNION ALL
        SELECT created_at FROM local_customer_ops WHERE sync_status IN ('PENDING','FAILED')
      ) q
      `,
    ).get() as { oldest?: string | null };
    return typeof row.oldest === 'string' && row.oldest.length > 0 ? row.oldest : null;
  }

  private getQueuePeak(): number {
    const raw = this.getSetting(SYNC_QUEUE_PEAK_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return parsed;
  }

  private touchQueuePeak(pendingCount: number): void {
    const currentPeak = this.getQueuePeak();
    if (pendingCount > currentPeak) {
      this.setSetting(SYNC_QUEUE_PEAK_KEY, String(pendingCount));
    }
  }

  public getSyncStatusSummary(): SyncStatusSummary {
    const {
      customerOps,
      productOps,
      purchaseOps,
      refunds,
      sales,
      stockOps,
      supplierOps,
    } = this.getQueueCounts();
    const pendingCount =
      sales +
      refunds +
      productOps +
      supplierOps +
      purchaseOps +
      stockOps +
      customerOps;
    this.touchQueuePeak(pendingCount);
    const lastSyncedAt = this.getLastSyncAt();
    const queuePeak = this.getQueuePeak();
    const oldestPendingCreatedAt = this.getOldestPendingCreatedAt();
    const oldestPendingAgeSec =
      oldestPendingCreatedAt && Number.isFinite(Date.parse(oldestPendingCreatedAt))
        ? Math.max(
            0,
            Math.floor((Date.now() - Date.parse(oldestPendingCreatedAt)) / 1000),
          )
        : null;
    const failedSales = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_sales WHERE sync_status = 'FAILED'`,
    ).get() as { total: number };
    const failedRefunds = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_refunds WHERE sync_status = 'FAILED'`,
    ).get() as { total: number };
    const failedProductOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_product_ops WHERE sync_status = 'FAILED'`,
    ).get() as { total: number };
    const failedSupplierOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_supplier_ops WHERE sync_status = 'FAILED'`,
    ).get() as { total: number };
    const failedPurchaseOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_purchase_ops WHERE sync_status = 'FAILED'`,
    ).get() as { total: number };
    const failedStockOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_stock_ops WHERE sync_status = 'FAILED'`,
    ).get() as { total: number };
    const failedCustomerOps = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_customer_ops WHERE sync_status = 'FAILED'`,
    ).get() as { total: number };
    const hasFailed =
      failedSales.total +
        failedRefunds.total +
        failedProductOps.total +
        failedSupplierOps.total +
        failedPurchaseOps.total +
        failedStockOps.total +
        failedCustomerOps.total >
      0;

    let lastSyncStatus: SyncHealthStatus = 'IDLE';
    if (lastSyncedAt && pendingCount === 0 && !hasFailed) {
      lastSyncStatus = 'OK';
    } else if (pendingCount > 0 || hasFailed || lastSyncedAt) {
      lastSyncStatus = 'DEGRADED';
    }

    return {
      lastSyncErrorCode: this.getLastSyncErrorCode(),
      lastSyncedAt,
      lastSyncStatus,
      oldestPendingAgeSec,
      pendingCount,
      customerOps,
      productOps,
      purchaseOps,
      queuePeak,
      refunds,
      sales,
      stockOps,
      supplierOps,
      queueByEntity: {
        customerOps: this.readQueueEntityStatusSummary('local_customer_ops'),
        productOps: this.readQueueEntityStatusSummary('local_product_ops'),
        purchaseOps: this.readQueueEntityStatusSummary('local_purchase_ops'),
        refunds: this.readQueueEntityStatusSummary('local_refunds'),
        sales: this.readQueueEntityStatusSummary('local_sales'),
        stockOps: this.readQueueEntityStatusSummary('local_stock_ops'),
        supplierOps: this.readQueueEntityStatusSummary('local_supplier_ops'),
      },
    };
  }

  public getLastSyncAt(): string | null {
    return this.getSetting(LAST_SYNC_AT_KEY);
  }

  public setLastSyncAt(value: string): void {
    this.setSetting(LAST_SYNC_AT_KEY, value);
  }

  public resetSyncCheckpoint(): void {
    this.removeSetting(LAST_SYNC_AT_KEY);
    this.removeSetting(LAST_SYNC_CURSOR_KEY);
    this.removeSetting(LAST_SYNC_ERROR_CODE_KEY);
  }

  public getLastSyncCursor(): string | null {
    return this.getSetting(LAST_SYNC_CURSOR_KEY);
  }

  public setLastSyncCursor(value: string): void {
    this.setSetting(LAST_SYNC_CURSOR_KEY, value);
  }

  public getLastSyncErrorCode(): string | null {
    const value = this.getSetting(LAST_SYNC_ERROR_CODE_KEY);
    return value && value.length > 0 ? value : null;
  }

  public setLastSyncErrorCode(value: string | null): void {
    if (!value || value.trim().length === 0) {
      this.removeSetting(LAST_SYNC_ERROR_CODE_KEY);
      return;
    }
    this.setSetting(LAST_SYNC_ERROR_CODE_KEY, value.trim());
  }

  public countActiveCachedProducts(companyId: string): number {
    const row = this.db.prepare(
      `
      SELECT COUNT(1) AS total
      FROM cached_products
      WHERE company_id = ? AND is_active = 1
      `,
    ).get(companyId) as { total: number } | undefined;
    return Number(row?.total ?? 0);
  }

  public async createBackup(targetPath: string): Promise<void> {
    this.db.pragma('wal_checkpoint(FULL)');
    const escapedTargetPath = targetPath.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escapedTargetPath}'`);
  }

  public runIntegrityCheck(): { detail: string; ok: boolean } {
    try {
      const row = this.db.prepare('PRAGMA quick_check').get() as
        | { quick_check?: string }
        | undefined;
      const detail =
        typeof row?.quick_check === 'string' ? row.quick_check : 'unknown';
      return {
        detail,
        ok: detail.toLowerCase() === 'ok',
      };
    } catch (error: unknown) {
      return {
        detail: error instanceof Error ? error.message : 'quick_check failed',
        ok: false,
      };
    }
  }

  public validateBackupFile(absolutePath: string): { detail: string; ok: boolean } {
    let checkDb: Database.Database | null = null;
    try {
      checkDb = new Database(absolutePath);
      const row = checkDb.prepare('PRAGMA quick_check').get() as
        | { quick_check?: string }
        | undefined;
      const detail =
        typeof row?.quick_check === 'string' ? row.quick_check : 'unknown';
      return {
        detail,
        ok: detail.toLowerCase() === 'ok',
      };
    } catch (error: unknown) {
      return {
        detail: error instanceof Error ? error.message : 'backup validation failed',
        ok: false,
      };
    } finally {
      try {
        checkDb?.close();
      } catch {
        // no-op
      }
    }
  }

  public logSecurityEvent(payload: LogSecurityEventPayload): SecurityEventRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db.prepare(
      `
      INSERT INTO local_security_events (
        id, event_type, severity, message, operator_user_id, manager_user_id, reason, metadata_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      payload.eventType,
      payload.severity,
      payload.message,
      payload.operatorUserId ?? null,
      payload.managerUserId ?? null,
      payload.reason ?? null,
      payload.metadataJson ?? null,
      createdAt,
    );

    return {
      createdAt,
      eventType: payload.eventType,
      id,
      managerUserId: payload.managerUserId ?? null,
      message: payload.message,
      metadataJson: payload.metadataJson ?? null,
      operatorUserId: payload.operatorUserId ?? null,
      reason: payload.reason ?? null,
      severity: payload.severity,
    };
  }

  public listSecurityEvents(limit = 100): SecurityEventRecord[] {
    const safeLimit = Math.max(1, Math.min(500, Math.round(limit)));
    const rows = this.db.prepare(
      `
      SELECT id, event_type, severity, message, operator_user_id, manager_user_id, reason, metadata_json, created_at
      FROM local_security_events
      ORDER BY created_at DESC
      LIMIT ?
      `,
    ).all(safeLimit) as SecurityEventRow[];

    return rows.map((row) => ({
      createdAt: row.created_at,
      eventType: row.event_type,
      id: row.id,
      managerUserId: row.manager_user_id,
      message: row.message,
      metadataJson: row.metadata_json,
      operatorUserId: row.operator_user_id,
      reason: row.reason,
      severity: row.severity,
    }));
  }

  public recordShiftHandover(payload: RecordShiftHandoverPayload): ShiftHandoverRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const expectedCash = Number(payload.expectedCash);
    const declaredCash = Number(payload.declaredCash);
    const difference = declaredCash - expectedCash;

    this.db.prepare(
      `
      INSERT INTO local_shift_handovers (
        id, register_id, operator_user_id, manager_user_id, expected_cash, declared_cash, difference, blind_close, note, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      payload.registerId,
      payload.operatorUserId,
      payload.managerUserId ?? null,
      expectedCash,
      declaredCash,
      difference,
      payload.blindClose ? 1 : 0,
      payload.note ?? null,
      createdAt,
    );

    return {
      blindClose: payload.blindClose,
      createdAt,
      declaredCash,
      difference,
      expectedCash,
      id,
      managerUserId: payload.managerUserId ?? null,
      note: payload.note ?? null,
      operatorUserId: payload.operatorUserId,
      registerId: payload.registerId,
    };
  }

  public listShiftHandovers(registerId?: string, limit = 100): ShiftHandoverRecord[] {
    const safeLimit = Math.max(1, Math.min(500, Math.round(limit)));
    const rows = this.db.prepare(
      `
      SELECT id, register_id, operator_user_id, manager_user_id, expected_cash, declared_cash, difference, blind_close, note, created_at
      FROM local_shift_handovers
      WHERE (? IS NULL OR register_id = ?)
      ORDER BY created_at DESC
      LIMIT ?
      `,
    ).all(registerId ?? null, registerId ?? null, safeLimit) as ShiftHandoverRow[];

    return rows.map((row) => ({
      blindClose: row.blind_close === 1,
      createdAt: row.created_at,
      declaredCash: row.declared_cash,
      difference: row.difference,
      expectedCash: row.expected_cash,
      id: row.id,
      managerUserId: row.manager_user_id,
      note: row.note,
      operatorUserId: row.operator_user_id,
      registerId: row.register_id,
    }));
  }

  public recordCashMovement(payload: RecordCashMovementPayload): CashMovementRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const amount = Math.abs(Number(payload.amount));
    this.db.prepare(
      `
      INSERT INTO local_cash_movements (
        id, register_id, operator_user_id, movement_type, amount, note, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      payload.registerId,
      payload.operatorUserId,
      payload.movementType,
      amount,
      payload.note ?? null,
      createdAt,
    );

    return {
      amount,
      createdAt,
      id,
      movementType: payload.movementType,
      note: payload.note ?? null,
      operatorUserId: payload.operatorUserId,
      registerId: payload.registerId,
    };
  }

  public listCashMovements(registerId?: string, limit = 100): CashMovementRecord[] {
    const safeLimit = Math.max(1, Math.min(500, Math.round(limit)));
    const rows = this.db.prepare(
      `
      SELECT id, register_id, operator_user_id, movement_type, amount, note, created_at
      FROM local_cash_movements
      WHERE (? IS NULL OR register_id = ?)
      ORDER BY created_at DESC
      LIMIT ?
      `,
    ).all(registerId ?? null, registerId ?? null, safeLimit) as CashMovementRow[];

    return rows.map((row) => ({
      amount: row.amount,
      createdAt: row.created_at,
      id: row.id,
      movementType: row.movement_type,
      note: row.note,
      operatorUserId: row.operator_user_id,
      registerId: row.register_id,
    }));
  }

  public getLocalDailyReport(params: {
    companyId: string;
    limit?: number;
    referenceAt?: string;
    registerId: string;
    from?: string;
    to?: string;
  }): LocalDailyReportSnapshot {
    const safeLimit = Math.max(1, Math.min(100, Math.round(params.limit ?? 10)));
    let startIso: string;
    let endIso: string;
    let dayLabel: string;

    if (params.from && params.to) {
      const baseFrom = new Date(params.from);
      const safeFrom = Number.isFinite(baseFrom.getTime()) ? baseFrom : new Date();
      safeFrom.setHours(0, 0, 0, 0);

      const baseTo = new Date(params.to);
      const safeTo = Number.isFinite(baseTo.getTime()) ? baseTo : new Date();
      safeTo.setHours(23, 59, 59, 999);

      startIso = safeFrom.toISOString();
      endIso = safeTo.toISOString();
      dayLabel = `${params.from} - ${params.to}`;
    } else {
      const window = toLocalDayWindow(params.referenceAt);
      startIso = window.startIso;
      endIso = window.endIso;
      dayLabel = window.dayLabel;
    }

    const cachedProductRows = this.db.prepare(
      `
      SELECT id, name, vat_rate
      FROM cached_products
      WHERE company_id = ?
      `,
    ).all(params.companyId) as Array<Pick<CachedProductRow, 'id' | 'name' | 'vat_rate'>>;

    const productNameById = new Map<string, string>();
    const productVatRateById = new Map<string, number>();
    for (const row of cachedProductRows) {
      productNameById.set(row.id, row.name);
      productVatRateById.set(row.id, row.vat_rate);
    }

    const saleRows = this.db.prepare(
      `
      SELECT payload_data, created_at
      FROM local_sales
      WHERE created_at >= ? AND created_at < ?
      ORDER BY created_at ASC
      `,
    ).all(startIso, endIso) as LocalQueueReportRow[];

    const refundRows = this.db.prepare(
      `
      SELECT payload_data, created_at
      FROM local_refunds
      WHERE created_at >= ? AND created_at < ?
      ORDER BY created_at ASC
      `,
    ).all(startIso, endIso) as LocalQueueReportRow[];

    const paymentTotals: Record<LocalReportPaymentMethod, number> = {
      CASH: 0,
      CREDIT_CARD: 0,
      DEBIT_CARD: 0,
      ON_ACCOUNT: 0,
    };
    const topProductMap = new Map<
      string,
      { count: number; productName: string; totalQuantity: number; totalRevenue: number }
    >();

    let salesCount = 0;
    let totalSales = 0;
    let totalVat = 0;

    const parsedSalePayloads: unknown[] = [];
    for (const row of saleRows) {
      try {
        parsedSalePayloads.push(JSON.parse(row.payload_data));
      } catch {
        // Ignore malformed queue rows in local report computation.
      }
    }

    const parsedRefundPayloads: unknown[] = [];
    for (const row of refundRows) {
      try {
        parsedRefundPayloads.push(JSON.parse(row.payload_data));
      } catch {
        // Ignore malformed queue rows in local report computation.
      }
    }

    const hasCurrentRegisterSales = parsedSalePayloads.some(
      (payload) =>
        isRecord(payload) &&
        typeof payload.registerId === 'string' &&
        payload.registerId === params.registerId,
    );
    const hasCurrentRegisterRefunds = parsedRefundPayloads.some(
      (payload) =>
        isRecord(payload) &&
        typeof payload.registerId === 'string' &&
        payload.registerId === params.registerId,
    );
    const allowAllRegisters = !hasCurrentRegisterSales && !hasCurrentRegisterRefunds;

    for (const payload of parsedSalePayloads) {
      if (!isRecord(payload)) {
        continue;
      }
      if (
        !allowAllRegisters &&
        typeof payload.registerId === 'string' &&
        payload.registerId !== params.registerId
      ) {
        continue;
      }

      salesCount += 1;
      let saleTotalFromPayments = 0;
      let saleTotalFromItems = 0;

      const payments = Array.isArray(payload.payments) ? payload.payments : [];
      for (const payment of payments) {
        if (!isRecord(payment)) {
          continue;
        }
        const method = readPaymentMethod(payment.method);
        const amount = readFiniteNumber(payment.amount) ?? 0;
        if (!method || amount <= 0) {
          continue;
        }
        paymentTotals[method] += amount;
        saleTotalFromPayments += amount;
      }

      const items = Array.isArray(payload.items) ? payload.items : [];
      for (const item of items) {
        if (!isRecord(item)) {
          continue;
        }
        const productId = typeof item.productId === 'string' ? item.productId : null;
        if (!productId) {
          continue;
        }
        const quantity = readFiniteNumber(item.quantity) ?? 0;
        const unitPrice = readFiniteNumber(item.unitPrice) ?? 0;
        const discount = Math.max(0, readFiniteNumber(item.discount) ?? 0);
        if (quantity <= 0 || unitPrice < 0) {
          continue;
        }

        const lineTotal = Math.max(0, quantity * unitPrice - discount);
        saleTotalFromItems += lineTotal;

        const vatRate = Math.max(0, productVatRateById.get(productId) ?? 0);
        if (vatRate > 0) {
          totalVat += (lineTotal * vatRate) / (100 + vatRate);
        }

        const current = topProductMap.get(productId) ?? {
          count: 0,
          productName: productNameById.get(productId) ?? 'Bilinmeyen Urun',
          totalQuantity: 0,
          totalRevenue: 0,
        };
        current.count += 1;
        current.totalQuantity += quantity;
        current.totalRevenue += lineTotal;
        topProductMap.set(productId, current);
      }

      const resolvedSaleTotal =
        saleTotalFromPayments > 0 ? saleTotalFromPayments : saleTotalFromItems;
      totalSales += resolvedSaleTotal;
    }

    let refundsCount = 0;
    let totalRefunds = 0;
    for (const payload of parsedRefundPayloads) {
      if (!isRecord(payload)) {
        continue;
      }
      if (
        !allowAllRegisters &&
        typeof payload.registerId === 'string' &&
        payload.registerId !== params.registerId
      ) {
        continue;
      }

      refundsCount += 1;

      const explicitTotal = readFiniteNumber(payload.totalAmount);
      if (explicitTotal !== null && explicitTotal >= 0) {
        totalRefunds += explicitTotal;
        continue;
      }

      let computedTotal = 0;
      const reportItems = Array.isArray(payload.reportItems)
        ? payload.reportItems
        : Array.isArray(payload.items)
          ? payload.items
          : [];
      for (const item of reportItems) {
        if (!isRecord(item)) {
          continue;
        }
        const quantity = readFiniteNumber(item.quantity) ?? 0;
        const unitPrice = readFiniteNumber(item.unitPrice) ?? 0;
        if (quantity <= 0 || unitPrice < 0) {
          continue;
        }
        computedTotal += quantity * unitPrice;
      }
      totalRefunds += computedTotal;
    }

    const topProducts = Array.from(topProductMap.entries())
      .map(([productId, value]) => ({
        count: value.count,
        productId,
        productName: value.productName,
        totalQuantity: roundCurrency(value.totalQuantity),
        totalRevenue: roundCurrency(value.totalRevenue),
      }))
      .sort(
        (left, right) =>
          right.totalRevenue - left.totalRevenue ||
          right.totalQuantity - left.totalQuantity ||
          left.productName.localeCompare(right.productName),
      )
      .slice(0, safeLimit);

    const normalizedTotalSales = roundCurrency(totalSales);
    const normalizedTotalRefunds = roundCurrency(totalRefunds);
    const normalizedTotalVat = roundCurrency(totalVat);

    return {
      report: {
        date: dayLabel,
        netSales: roundCurrency(normalizedTotalSales - normalizedTotalRefunds),
        paymentBreakdown: [
          { method: 'CASH', total: roundCurrency(paymentTotals.CASH) },
          { method: 'CREDIT_CARD', total: roundCurrency(paymentTotals.CREDIT_CARD) },
          { method: 'DEBIT_CARD', total: roundCurrency(paymentTotals.DEBIT_CARD) },
          { method: 'ON_ACCOUNT', total: roundCurrency(paymentTotals.ON_ACCOUNT) },
        ],
        refundsCount,
        salesCount,
        totalRefunds: normalizedTotalRefunds,
        totalSales: normalizedTotalSales,
        totalVat: normalizedTotalVat,
      },
      topProducts,
    };
  }

  public close(): void {
    this.db.close();
  }

  public getCachedCustomers(companyId: string, search?: string): any[] {
    const searchPredicate = search ? 'AND (full_name LIKE ? OR phone LIKE ? OR tax_number LIKE ?)' : '';
    const rows = this.db.prepare(
      `
      SELECT id, company_id, full_name, phone, email, tax_number, address, balance, loyalty_points, price_tier, is_active
      FROM cached_customers
      WHERE company_id = ?
        AND is_active = 1
        ${searchPredicate}
      ORDER BY full_name ASC
      `,
    ).all(
      companyId,
      ...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])
    ) as any[];

    return rows.map((row) => ({
      address: row.address,
      balance: row.balance,
      companyId: row.company_id,
      email: row.email,
      fullName: row.full_name,
      id: row.id,
      isActive: row.is_active === 1,
      loyaltyPoints: row.loyalty_points,
      priceTier: (row.price_tier as any) || 'RETAIL',
    }));
  }

  public syncBundles(companyId: string, bundles: any[]): void {
    this.db.prepare('DELETE FROM cached_bundles WHERE company_id = ?').run(companyId);
    const insertBundle = this.db.prepare(`
      INSERT INTO cached_bundles (id, company_id, name, product_ids_json, bundle_price, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const b of bundles) {
      insertBundle.run(
        b.id,
        companyId,
        b.name,
        JSON.stringify(b.productIds),
        b.fixedPrice,
        b.isActive ? 1 : 0,
        b.updatedAt || new Date().toISOString()
      );
    }
  }

  public listCachedBundles(companyId: string): CachedBundleRecord[] {
    const rows = this.db.prepare(
      `
      SELECT id, company_id, name, product_ids_json, bundle_price, is_active, updated_at
      FROM cached_bundles
      WHERE company_id = ? AND is_active = 1
      ORDER BY name ASC
      `
    ).all(companyId) as any[];

    return rows.map(r => ({
      id: r.id,
      companyId: r.company_id,
      name: r.name,
      productIds: JSON.parse(r.product_ids_json),
      bundlePrice: r.bundle_price,
      isActive: r.is_active === 1,
      updatedAt: r.updated_at
    }));
  }

  public queueCustomerOp(payload: {
    localId?: string;
    opType: CustomerOpType;
    payload: unknown;
  }): CustomerOpQueueRecord {
    return this.queueOperationPayload(
      'local_customer_ops',
      payload.payload,
      payload.opType,
      payload.localId,
    );
  }

  public getLocalSetting(key: string, defaultValue: string | null = null): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : defaultValue;
  }

  public setLocalSetting(key: string, value: string): void {
    this.setSetting(key, value);
  }

  public getManagerByUsername(username: string, companyId?: string): CachedUserRecord | null {
    try {
      return this.resolveManagerUser(username, companyId);
    } catch {
      return null;
    }
  }

  private resolveManagerUser(
    username?: string,
    companyId?: string,
  ): CachedUserRecord {
    return this.resolveManagerUserWithHash(username, companyId).user;
  }

  private resolveManagerUserWithHash(
    username?: string,
    companyId?: string,
  ): { passwordHash: string | null; user: CachedUserRecord } {
    const row = this.db.prepare(
      `
      SELECT id, company_id, branch_id, username, full_name, role, is_active, password_hash
      FROM cached_users
      WHERE (? IS NULL OR company_id = ?)
        AND (? IS NULL OR username = ?)
        AND role IN ('ADMIN', 'SUPER_ADMIN')
        AND is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1
      `,
    ).get(
      companyId ?? null,
      companyId ?? null,
      username ?? null,
      username ?? null,
    ) as (CachedUserRow & { password_hash: string | null }) | undefined;

    if (!row) {
      throw new Error('Yonetici kullanici bulunamadi.');
    }

    return {
      passwordHash: row.password_hash,
      user: {
        branchId: row.branch_id,
        companyId: row.company_id,
        fullName: row.full_name,
        id: row.id,
        isActive: row.is_active === 1,
        role: row.role,
        username: row.username,
      },
    };
  }

  private queuePayload(
    table: 'local_refunds' | 'local_sales',
    payload: unknown,
    localId?: string,
  ): PendingSaleRecord {
    const id = localId ?? randomUUID();
    const now = new Date().toISOString();
    const payloadData = JSON.stringify(payload);
    const existing = this.db.prepare(
      `
      SELECT id, payload_data, sync_status, created_at, synced_at, failure_count, sync_error
      FROM ${table}
      WHERE id = ?
      LIMIT 1
      `,
    ).get(id) as PendingQueueRow | undefined;
    if (existing) {
      return toPendingRecord(existing);
    }
    this.db.prepare(
      `
      INSERT INTO ${table} (id, payload_data, sync_status, failure_count, created_at, updated_at)
      VALUES (?, ?, 'PENDING', 0, ?, ?)
      `,
    ).run(id, payloadData, now, now);
    const queueCounts = this.getQueueCounts();
    this.touchQueuePeak(
      queueCounts.sales +
        queueCounts.refunds +
        queueCounts.productOps +
        queueCounts.supplierOps +
        queueCounts.purchaseOps +
        queueCounts.stockOps +
        queueCounts.customerOps,
    );

    return {
      createdAt: now,
      id,
      payloadData,
      syncStatus: 'PENDING',
      syncedAt: null,
      failureCount: 0,
    };
  }

  private queueOperationPayload<TType extends string>(
    table:
      | 'local_customer_ops'
      | 'local_product_ops'
      | 'local_purchase_ops'
      | 'local_stock_ops'
      | 'local_supplier_ops',
    payload: unknown,
    opType: TType,
    localId?: string,
  ): {
    createdAt: string;
    id: string;
    opType: TType;
    payloadData: string;
    syncStatus: LocalSyncStatus;
    syncedAt: string | null;
    failureCount: number;
  } {
    const id = localId ?? randomUUID();
    const now = new Date().toISOString();
    const payloadData = JSON.stringify(payload);
    const existing = this.db.prepare(
      `
      SELECT id, op_type, payload_data, sync_status, created_at, synced_at, failure_count, sync_error
      FROM ${table}
      WHERE id = ?
      LIMIT 1
      `,
    ).get(id) as PendingOperationQueueRow | undefined;
    if (existing) {
      return toPendingOperationRecord<TType>(existing);
    }
    this.db.prepare(
      `
      INSERT INTO ${table} (id, op_type, payload_data, sync_status, failure_count, created_at, updated_at)
      VALUES (?, ?, ?, 'PENDING', 0, ?, ?)
      `,
    ).run(id, opType, payloadData, now, now);
    const queueCounts = this.getQueueCounts();
    this.touchQueuePeak(
      queueCounts.sales +
        queueCounts.refunds +
        queueCounts.productOps +
        queueCounts.supplierOps +
        queueCounts.purchaseOps +
        queueCounts.stockOps +
        queueCounts.customerOps,
    );

    return {
      createdAt: now,
      id,
      opType,
      payloadData,
      syncStatus: 'PENDING',
      syncedAt: null,
      failureCount: 0,
    };
  }

  private resolveOperationTableFromPayload(
    payload: unknown,
  ): 'local_product_ops' | 'local_purchase_ops' | 'local_supplier_ops' {
    if (!payload || typeof payload !== 'object') {
      return 'local_product_ops';
    }
    const candidate = payload as { path?: unknown };
    if (typeof candidate.path !== 'string') {
      return 'local_product_ops';
    }
    const normalizedPath = candidate.path.startsWith('/') ? candidate.path : `/${candidate.path}`;
    if (normalizedPath === '/api/suppliers' || normalizedPath.startsWith('/api/suppliers/')) {
      return 'local_supplier_ops';
    }
    if (
      normalizedPath === '/api/purchase-invoices' ||
      normalizedPath.startsWith('/api/purchase-invoices/')
    ) {
      return 'local_purchase_ops';
    }
    return 'local_product_ops';
  }

  private readQueueEntityStatusSummary(
    table:
      | 'local_customer_ops'
      | 'local_product_ops'
      | 'local_purchase_ops'
      | 'local_refunds'
      | 'local_sales'
      | 'local_stock_ops'
      | 'local_supplier_ops',
  ): QueueEntityStatusSummary {
    const rows = this.db.prepare(
      `
      SELECT sync_status, COUNT(1) as total
      FROM ${table}
      GROUP BY sync_status
      `,
    ).all() as Array<{ sync_status: LocalSyncStatus; total: number }>;
    const byStatus: Record<LocalSyncStatus, number> = {
      FAILED: 0,
      PENDING: 0,
      SYNCED: 0,
    };
    for (const row of rows) {
      byStatus[row.sync_status] = Number(row.total ?? 0);
    }
    return {
      failed: byStatus.FAILED,
      pending: byStatus.PENDING,
      queued: byStatus.FAILED + byStatus.PENDING,
      synced: byStatus.SYNCED,
    };
  }

  private applyQueuedProductOperation(payload: unknown): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const record = payload as {
      barcode?: string;
      categoryId?: string | null;
      companyId?: string;
      id?: string;
      isQuickAccess?: boolean;
      name?: string;
      quickAccessColor?: string | null;
      quickAccessOrder?: number | null;
      salePrice?: number;
      vatRate?: number;
      isActive?: boolean;
    };
    if (
      typeof record.id !== 'string' ||
      typeof record.companyId !== 'string' ||
      typeof record.name !== 'string' ||
      typeof record.barcode !== 'string' ||
      typeof record.salePrice !== 'number' ||
      typeof record.vatRate !== 'number'
    ) {
      return;
    }
    const now = new Date().toISOString();
    this.db.prepare(
      `
      INSERT INTO cached_products (
        id,
        company_id,
        category_id,
        barcode,
        name,
        sale_price,
        vat_rate,
        is_quick_access,
        quick_access_color,
        quick_access_order,
        is_active,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        category_id = excluded.category_id,
        barcode = excluded.barcode,
        name = excluded.name,
        sale_price = excluded.sale_price,
        vat_rate = excluded.vat_rate,
        is_quick_access = excluded.is_quick_access,
        quick_access_color = excluded.quick_access_color,
        quick_access_order = excluded.quick_access_order,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at
      `,
    ).run(
      record.id,
      record.companyId,
      record.categoryId ?? null,
      record.barcode,
      record.name,
      record.salePrice,
      record.vatRate,
      record.isQuickAccess ? 1 : 0,
      record.quickAccessColor ?? null,
      typeof record.quickAccessOrder === 'number' ? record.quickAccessOrder : null,
      typeof record.isActive === 'boolean' ? (record.isActive ? 1 : 0) : 1,
      now,
    );
  }

  private listPendingQueue(
    table: 'local_refunds' | 'local_sales',
    limit: number,
  ): PendingQueueRow[] {
    return this.db.prepare(
      `
      SELECT id, payload_data, sync_status, created_at, synced_at, failure_count, sync_error
      FROM ${table}
      WHERE sync_status IN ('PENDING','FAILED')
      ORDER BY created_at ASC
      LIMIT ?
      `,
    ).all(limit) as PendingQueueRow[];
  }

  private listPendingOperationQueue(
    table:
      | 'local_customer_ops'
      | 'local_product_ops'
      | 'local_purchase_ops'
      | 'local_stock_ops'
      | 'local_supplier_ops',
    limit: number,
  ): PendingOperationQueueRow[] {
    return this.db.prepare(
      `
      SELECT id, op_type, payload_data, sync_status, created_at, synced_at, failure_count, sync_error
      FROM ${table}
      WHERE sync_status IN ('PENDING','FAILED')
      ORDER BY created_at ASC
      LIMIT ?
      `,
    ).all(limit) as PendingOperationQueueRow[];
  }

  private markQueueSynced(
    table:
      | 'local_customer_ops'
      | 'local_refunds'
      | 'local_sales'
      | 'local_product_ops'
      | 'local_purchase_ops'
      | 'local_stock_ops'
      | 'local_supplier_ops',
    ids: string[],
  ): number {
    if (ids.length === 0) {
      return 0;
    }
    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(', ');
    const result = this.db.prepare(
      `
      UPDATE ${table}
      SET sync_status = 'SYNCED', sync_error = NULL, failure_count = 0, synced_at = ?, updated_at = ?
      WHERE id IN (${placeholders})
      `,
    ).run(now, now, ...ids);
    return Number(result.changes ?? 0);
  }

  private markQueueFailed(
    table:
      | 'local_customer_ops'
      | 'local_refunds'
      | 'local_sales'
      | 'local_product_ops'
      | 'local_purchase_ops'
      | 'local_stock_ops'
      | 'local_supplier_ops',
    id: string,
    errorMessage: string,
  ): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      `
      UPDATE ${table}
      SET sync_status = 'FAILED', sync_error = ?, failure_count = failure_count + 1, synced_at = NULL, updated_at = ?
      WHERE id = ?
      `,
    ).run(errorMessage, now, id);
    return Number(result.changes ?? 0);
  }

  private getSetting(key: string): string | null {
    const row = this.db.prepare(
      `
      SELECT value FROM app_settings WHERE key = ? LIMIT 1
      `,
    ).get(key) as SettingsRow | undefined;
    return row?.value ?? null;
  }

  private setSetting(key: string, value: string): void {
    this.db.prepare(
      `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `,
    ).run(key, value, new Date().toISOString());
  }

  private removeSetting(key: string): void {
    this.db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(key);
  }

  private setSetupState(state: SetupState): void {
    this.setSetting(SETUP_STATE_KEY, JSON.stringify(state));
  }

  private getCompanyAccessSettingKey(companyId: string): string {
    return `${COMPANY_ACCESS_KEY_PREFIX}${companyId}`;
  }

  private initializeSchema(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS local_sales (
          id TEXT PRIMARY KEY,
          payload_data TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          sync_error TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS local_refunds (
          id TEXT PRIMARY KEY,
          payload_data TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          sync_error TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS local_product_ops (
          id TEXT PRIMARY KEY,
          op_type TEXT NOT NULL,
          payload_data TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          sync_error TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS local_stock_ops (
          id TEXT PRIMARY KEY,
          op_type TEXT NOT NULL,
          payload_data TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          sync_error TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS local_customer_ops (
          id TEXT PRIMARY KEY,
          op_type TEXT NOT NULL,
          payload_data TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          sync_error TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS local_supplier_ops (
          id TEXT PRIMARY KEY,
          op_type TEXT NOT NULL,
          payload_data TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          sync_error TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS local_purchase_ops (
          id TEXT PRIMARY KEY,
          op_type TEXT NOT NULL,
          payload_data TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          sync_error TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_local_sales_sync
          ON local_sales (sync_status, created_at);
        CREATE INDEX IF NOT EXISTS idx_local_refunds_sync
          ON local_refunds (sync_status, created_at);
        CREATE INDEX IF NOT EXISTS idx_local_product_ops_sync
          ON local_product_ops (sync_status, created_at);
        CREATE INDEX IF NOT EXISTS idx_local_stock_ops_sync
          ON local_stock_ops (sync_status, created_at);
        CREATE INDEX IF NOT EXISTS idx_local_supplier_ops_sync
          ON local_supplier_ops (sync_status, created_at);
        CREATE INDEX IF NOT EXISTS idx_local_purchase_ops_sync
          ON local_purchase_ops (sync_status, created_at);

        CREATE TABLE IF NOT EXISTS cached_users (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT,
          username TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          password_hash TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cached_users_company_username
          ON cached_users (company_id, username);

        CREATE TABLE IF NOT EXISTS cached_categories (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          name TEXT NOT NULL,
          parent_id TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          color TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cached_categories_company
          ON cached_categories (company_id, sort_order, name);

        CREATE TABLE IF NOT EXISTS cached_products (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          category_id TEXT,
          supplier_id TEXT,
          supplier_name TEXT,
          barcode TEXT NOT NULL,
          name TEXT NOT NULL,
          brand TEXT,
          description TEXT,
          is_active INTEGER DEFAULT 1,
          is_quick_access INTEGER DEFAULT 0,
          quick_access_color TEXT,
          quick_access_order INTEGER,
          purchase_price REAL DEFAULT 0,
          sale_price REAL NOT NULL,
          wholesale_price REAL,
          vat_rate REAL NOT NULL,
          stock_level REAL DEFAULT 0,
          estimated_stock REAL DEFAULT 0,
          campaign_json TEXT,
          expiry_date TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_cached_products_company_name
          ON cached_products (company_id, name);
        CREATE INDEX IF NOT EXISTS idx_cached_products_company_barcode
          ON cached_products (company_id, barcode);

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS local_security_events (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT NOT NULL,
          operator_user_id TEXT,
          manager_user_id TEXT,
          reason TEXT,
          metadata_json TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_local_security_events_created
          ON local_security_events (created_at DESC);

        CREATE TABLE IF NOT EXISTS local_shift_handovers (
          id TEXT PRIMARY KEY,
          register_id TEXT NOT NULL,
          operator_user_id TEXT NOT NULL,
          manager_user_id TEXT,
          expected_cash REAL NOT NULL,
          declared_cash REAL NOT NULL,
          difference REAL NOT NULL,
          blind_close INTEGER NOT NULL DEFAULT 0,
          note TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_local_shift_handovers_register_created
          ON local_shift_handovers (register_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS local_cash_movements (
          id TEXT PRIMARY KEY,
          register_id TEXT NOT NULL,
          operator_user_id TEXT NOT NULL,
          movement_type TEXT NOT NULL,
          amount REAL NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_local_cash_movements_register_created
          ON local_cash_movements (register_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS cached_suppliers (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          name TEXT NOT NULL,
          balance REAL DEFAULT 0,
          phone TEXT,
          tax_number TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cached_suppliers_company ON cached_suppliers (company_id);

        CREATE TABLE IF NOT EXISTS cached_customers (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          full_name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          address TEXT,
          tax_number TEXT,
          balance REAL DEFAULT 0,
          loyalty_points REAL DEFAULT 0,
          price_tier TEXT DEFAULT 'RETAIL',
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_cached_customers_company_name ON cached_customers (company_id, full_name);

        CREATE TABLE IF NOT EXISTS cached_purchase_invoice_items (
          id TEXT PRIMARY KEY,
          purchase_invoice_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          quantity REAL NOT NULL,
          unit_price REAL NOT NULL,
          vat_amount REAL DEFAULT 0,
          discount REAL DEFAULT 0,
          line_total REAL NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cached_purchase_invoice_items_invoice ON cached_purchase_invoice_items (purchase_invoice_id);

        CREATE TABLE IF NOT EXISTS cached_purchase_invoices (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          branch_id TEXT NOT NULL,
          supplier_id TEXT NOT NULL,
          invoice_number TEXT NOT NULL,
          document_type TEXT,
          dispatch_number TEXT,
          document_date TEXT,
          due_date TEXT,
          source_dispatch_id TEXT,
          converted_to_invoice_id TEXT,
          converted_at TEXT,
          subtotal REAL DEFAULT 0,
          total_vat REAL DEFAULT 0,
          total_discount REAL DEFAULT 0,
          grand_total REAL DEFAULT 0,
          total_grand_total REAL NOT NULL,
          status TEXT NOT NULL,
          invoice_date TEXT NOT NULL,
          created_at TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cached_purchase_invoices_branch ON cached_purchase_invoices (branch_id);

        CREATE TABLE IF NOT EXISTS cached_bundles (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          name TEXT NOT NULL,
          product_ids_json TEXT NOT NULL,
          bundle_price REAL NOT NULL,
          is_active INTEGER DEFAULT 1,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_cached_bundles_company ON cached_bundles (company_id);

        CREATE INDEX IF NOT EXISTS idx_local_customer_ops_sync ON local_customer_ops (sync_status, created_at);

        -- FTS5 Search Table
        CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
          barcode,
          name,
          content='cached_products',
          content_rowid='rowid'
        );

        -- FTS5 Triggers
        CREATE TRIGGER IF NOT EXISTS trg_products_ai AFTER INSERT ON cached_products BEGIN
          INSERT INTO products_fts(rowid, barcode, name) VALUES (new.rowid, new.barcode, new.name);
        END;
        CREATE TRIGGER IF NOT EXISTS trg_products_ad AFTER DELETE ON cached_products BEGIN
          INSERT INTO products_fts(products_fts, rowid, barcode, name) VALUES('delete', old.rowid, old.barcode, old.name);
        END;
        CREATE TRIGGER IF NOT EXISTS trg_products_au AFTER UPDATE ON cached_products BEGIN
          INSERT INTO products_fts(products_fts, rowid, barcode, name) VALUES('delete', old.rowid, old.barcode, old.name);
          INSERT INTO products_fts(rowid, barcode, name) VALUES (new.rowid, new.barcode, new.name);
        END;

        -- Migrations for existing tables (safe ALTER)
        -- (Ideally handled by a dedicated migration system, but for now we try/catch or ignore failure)
      `);

      // Add missing columns to existing installations
      const alterTables = [
        'local_sales',
        'local_refunds',
        'local_product_ops',
        'local_stock_ops',
        'local_customer_ops',
        'local_supplier_ops',
        'local_purchase_ops',
      ];
      for (const t of alterTables) {
        try {
          this.db.prepare(`ALTER TABLE ${t} ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0`).run();
        } catch { /* column likely exists */ }
      }

      // Compatibility migrations for older cached schema revisions
      const compatibilityMigrations = [
        `ALTER TABLE cached_products ADD COLUMN wholesale_price REAL`,
        `ALTER TABLE cached_products ADD COLUMN supplier_id TEXT`,
        `ALTER TABLE cached_products ADD COLUMN supplier_name TEXT`,
        `ALTER TABLE cached_products ADD COLUMN brand TEXT`,
        `ALTER TABLE cached_products ADD COLUMN description TEXT`,
        `ALTER TABLE cached_products ADD COLUMN purchase_price REAL DEFAULT 0`,
        `ALTER TABLE cached_products ADD COLUMN is_quick_access INTEGER DEFAULT 0`,
        `ALTER TABLE cached_products ADD COLUMN quick_access_color TEXT`,
        `ALTER TABLE cached_products ADD COLUMN quick_access_order INTEGER`,
        `ALTER TABLE cached_products ADD COLUMN is_active INTEGER DEFAULT 1`,
        `ALTER TABLE cached_products ADD COLUMN stock_level REAL DEFAULT 0`,
        `ALTER TABLE cached_products ADD COLUMN estimated_stock REAL DEFAULT 0`,
        `ALTER TABLE cached_products ADD COLUMN campaign_json TEXT`,
        `ALTER TABLE cached_products ADD COLUMN expiry_date TEXT`,
        `ALTER TABLE cached_categories ADD COLUMN color TEXT`,
        `ALTER TABLE cached_suppliers ADD COLUMN is_active INTEGER DEFAULT 1`,
        `ALTER TABLE cached_suppliers ADD COLUMN balance REAL DEFAULT 0`,
        `ALTER TABLE cached_customers ADD COLUMN loyalty_points REAL DEFAULT 0`,
        `ALTER TABLE cached_customers ADD COLUMN price_tier TEXT DEFAULT 'RETAIL'`,
        `ALTER TABLE cached_customers ADD COLUMN is_active INTEGER DEFAULT 1`,
        `ALTER TABLE cached_purchase_invoice_items ADD COLUMN vat_amount REAL DEFAULT 0`,
        `ALTER TABLE cached_purchase_invoice_items ADD COLUMN discount REAL DEFAULT 0`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN document_type TEXT`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN dispatch_number TEXT`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN document_date TEXT`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN due_date TEXT`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN source_dispatch_id TEXT`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN converted_to_invoice_id TEXT`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN converted_at TEXT`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN subtotal REAL DEFAULT 0`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN total_vat REAL DEFAULT 0`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN total_discount REAL DEFAULT 0`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN grand_total REAL DEFAULT 0`,
        `ALTER TABLE cached_purchase_invoices ADD COLUMN created_at TEXT`,
      ];
      for (const sql of compatibilityMigrations) {
        try {
          this.db.prepare(sql).run();
        } catch {
          // no-op: table or column already in expected shape
        }
      }
    } catch (error: unknown) {
      throw new Error(`SQLite schema initialization failed: ${readErrorMessage(error)}`);
    }
  }
}

// ========================
// Singleton Factory
// ========================

let _dbInstance: LocalDatabaseService | null = null;

export function getDatabaseService(): LocalDatabaseService {
  if (!_dbInstance) {
    throw new Error('DatabaseService henüz başlatılmadı. Önce initDatabaseService() çağrılmalı.');
  }
  return _dbInstance;
}

export function initDatabaseService(dbPath: string): LocalDatabaseService {
  if (_dbInstance) return _dbInstance;
  _dbInstance = new LocalDatabaseService(dbPath);
  return _dbInstance;
}
