import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
  | 'RUNTIME_CHECK'
  | 'HARDWARE_PROFILE'
  | 'HARDWARE_TEST'
  | 'ONLINE_ACTIVATION'
  | 'GO_LIVE';
export type SetupStepStatus = 'COMPLETED' | 'PENDING';
export type SetupResultStatus = 'FAILED' | 'SUCCESS';
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
  id: string;
  payload_data: string;
  sync_status: LocalSyncStatus;
  created_at: string;
  synced_at: string | null;
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
  category_id: string | null;
  company_id: string;
  id: string;
  is_quick_access: number;
  name: string;
  quick_access_color: string | null;
  quick_access_order: number | null;
  sale_price: number;
  vat_rate: number;
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

export interface PendingSaleRecord {
  createdAt: string;
  id: string;
  payloadData: string;
  syncStatus: LocalSyncStatus;
  syncedAt: string | null;
}

export interface PendingRefundRecord {
  createdAt: string;
  id: string;
  payloadData: string;
  syncStatus: LocalSyncStatus;
  syncedAt: string | null;
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

export interface UpsertSyncDataPayload {
  categories: CachedCategoryRecord[];
  products: CachedProductRecord[];
  users: CachedUserRecord[];
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
const SETUP_VERSION = 1;
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
const SETUP_STEP_ORDER: SetupStepId[] = [
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

function toPendingRecord(row: PendingQueueRow): PendingSaleRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    payloadData: row.payload_data,
    syncStatus: row.sync_status,
    syncedAt: row.synced_at,
  };
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Bilinmeyen hata';
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
  return {
    completedAt: null,
    lastResult: null,
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

function normalizeSetupStep(
  stepId: SetupStepId,
  value: unknown,
): SetupStepState {
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

export function parseSetupState(raw: string | null): SetupState {
  if (!raw) {
    return buildDefaultSetupState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SetupState>;
    if (!parsed || typeof parsed !== 'object') {
      return buildDefaultSetupState();
    }

    if (
      typeof parsed.setupVersion !== 'number' ||
      parsed.setupVersion !== SETUP_VERSION
    ) {
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

    return {
      completedAt:
        isAllCompleted && typeof parsed.completedAt === 'string'
          ? parsed.completedAt
          : null,
      lastResult: parseSetupResult(parsed.lastResult),
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
      payload.user.username,
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
    const row = this.db.prepare(
      `
      SELECT id, company_id, branch_id, username, full_name, role, is_active, password_hash
      FROM cached_users
      WHERE username = ?
        AND (? IS NULL OR company_id = ?)
      ORDER BY updated_at DESC
      LIMIT 1
      `,
    ).get(username, companyId ?? null, companyId ?? null) as
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

  public clearCachedSession(): void {
    this.removeSetting(AUTH_ACCESS_TOKEN_KEY);
    this.removeSetting(AUTH_REFRESH_TOKEN_KEY);
    this.removeSetting(AUTH_USER_ID_KEY);
    this.removeSetting(AUTH_REGISTER_ID_KEY);
    this.removeSetting(AUTH_SESSION_ID_KEY);
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
          id, company_id, category_id, barcode, name, sale_price, vat_rate, is_quick_access,
          quick_access_color, quick_access_order, is_active, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_id = excluded.company_id,
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
          product.barcode,
          product.name,
          product.salePrice,
          product.vatRate,
          product.isQuickAccess ? 1 : 0,
          product.quickAccessColor,
          product.quickAccessOrder,
          1,
          now,
        );
      }
    });

    tx();
  }

  public listCachedProducts(options: ListCachedProductsOptions): CachedProductRecord[] {
    const rows = this.db.prepare(
      `
      SELECT id, company_id, category_id, barcode, name, sale_price, vat_rate,
             is_quick_access, quick_access_color, quick_access_order
      FROM cached_products
      WHERE company_id = ?
        AND is_active = 1
        AND (? IS NULL OR category_id = ?)
        AND (? = 0 OR is_quick_access = 1)
        AND (
          ? IS NULL
          OR name LIKE '%' || ? || '%'
          OR barcode LIKE '%' || ? || '%'
        )
      ORDER BY COALESCE(quick_access_order, 999999), name ASC
      `,
    ).all(
      options.companyId,
      options.categoryId ?? null,
      options.categoryId ?? null,
      options.quickAccessOnly ? 1 : 0,
      options.search ?? null,
      options.search ?? null,
      options.search ?? null,
    ) as CachedProductRow[];

    return rows.map((row) => ({
      barcode: row.barcode,
      categoryId: row.category_id,
      companyId: row.company_id,
      id: row.id,
      isQuickAccess: row.is_quick_access === 1,
      name: row.name,
      quickAccessColor: row.quick_access_color,
      quickAccessOrder: row.quick_access_order,
      salePrice: row.sale_price,
      vatRate: row.vat_rate,
    }));
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

  public queueSale(sale: unknown, localId?: string): PendingSaleRecord {
    return this.queuePayload('local_sales', sale, localId);
  }

  public queueRefund(refund: unknown, localId?: string): PendingRefundRecord {
    return this.queuePayload('local_refunds', refund, localId);
  }

  public listPendingSales(limit = 200): PendingSaleRecord[] {
    return this.listPendingQueue('local_sales', limit).map((row) => toPendingRecord(row));
  }

  public listPendingRefunds(limit = 200): PendingRefundRecord[] {
    return this.listPendingQueue('local_refunds', limit).map((row) => toPendingRecord(row));
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

  public getQueueCounts(): { refunds: number; sales: number } {
    const sales = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_sales WHERE sync_status IN ('PENDING','FAILED')`,
    ).get() as { total: number };
    const refunds = this.db.prepare(
      `SELECT COUNT(1) as total FROM local_refunds WHERE sync_status IN ('PENDING','FAILED')`,
    ).get() as { total: number };
    return { refunds: refunds.total, sales: sales.total };
  }

  public getLastSyncAt(): string | null {
    return this.getSetting('last_sync_at');
  }

  public setLastSyncAt(value: string): void {
    this.setSetting('last_sync_at', value);
  }

  public async createBackup(targetPath: string): Promise<void> {
    this.db.pragma('wal_checkpoint(FULL)');
    const escapedTargetPath = targetPath.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escapedTargetPath}'`);
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

  public close(): void {
    this.db.close();
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
    this.db.prepare(
      `
      INSERT INTO ${table} (id, payload_data, sync_status, created_at, updated_at)
      VALUES (?, ?, 'PENDING', ?, ?)
      `,
    ).run(id, payloadData, now, now);

    return {
      createdAt: now,
      id,
      payloadData,
      syncStatus: 'PENDING',
      syncedAt: null,
    };
  }

  private listPendingQueue(
    table: 'local_refunds' | 'local_sales',
    limit: number,
  ): PendingQueueRow[] {
    return this.db.prepare(
      `
      SELECT id, payload_data, sync_status, created_at, synced_at
      FROM ${table}
      WHERE sync_status IN ('PENDING','FAILED')
      ORDER BY created_at ASC
      LIMIT ?
      `,
    ).all(limit) as PendingQueueRow[];
  }

  private markQueueSynced(table: 'local_refunds' | 'local_sales', ids: string[]): number {
    if (ids.length === 0) {
      return 0;
    }
    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(', ');
    const result = this.db.prepare(
      `
      UPDATE ${table}
      SET sync_status = 'SYNCED', sync_error = NULL, synced_at = ?, updated_at = ?
      WHERE id IN (${placeholders})
      `,
    ).run(now, now, ...ids);
    return Number(result.changes ?? 0);
  }

  private markQueueFailed(
    table: 'local_refunds' | 'local_sales',
    id: string,
    errorMessage: string,
  ): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      `
      UPDATE ${table}
      SET sync_status = 'FAILED', sync_error = ?, updated_at = ?
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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS local_refunds (
          id TEXT PRIMARY KEY,
          payload_data TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'PENDING',
          sync_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_local_sales_sync
          ON local_sales (sync_status, created_at);
        CREATE INDEX IF NOT EXISTS idx_local_refunds_sync
          ON local_refunds (sync_status, created_at);

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
          barcode TEXT NOT NULL,
          name TEXT NOT NULL,
          sale_price REAL NOT NULL,
          vat_rate REAL NOT NULL,
          is_quick_access INTEGER NOT NULL DEFAULT 0,
          quick_access_color TEXT,
          quick_access_order INTEGER,
          is_active INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
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
      `);
    } catch (error: unknown) {
      throw new Error(`SQLite schema initialization failed: ${readErrorMessage(error)}`);
    }
  }
}
