"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalDatabaseService = void 0;
exports.parseBackupPolicy = parseBackupPolicy;
exports.buildDefaultSetupState = buildDefaultSetupState;
exports.parseSetupState = parseSetupState;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const hardware_config_1 = require("./hardware-config");
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
const DEFAULT_BACKUP_POLICY = {
    enabled: true,
    intervalHours: 8,
    lastRunAt: null,
    maxBackups: 60,
    retentionDays: 21,
};
const SETUP_STEP_ORDER = [
    'RUNTIME_CHECK',
    'HARDWARE_PROFILE',
    'HARDWARE_TEST',
    'ONLINE_ACTIVATION',
    'GO_LIVE',
];
const SAFE_DEFAULT_HARDWARE_CONFIG = {
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
function cloneHardwareConfig(config) {
    return {
        ...config,
        drawerPulse: {
            off: config.drawerPulse.off,
            on: config.drawerPulse.on,
        },
    };
}
function fallbackNormalizeHardwareConfig(input) {
    const source = typeof input === 'object' && input !== null
        ? input
        : {};
    return {
        connectionMode: source.connectionMode === 'USB' ? 'USB' : 'LAN',
        copyCount: typeof source.copyCount === 'number' && Number.isFinite(source.copyCount)
            ? Math.max(1, Math.min(5, Math.round(source.copyCount)))
            : SAFE_DEFAULT_HARDWARE_CONFIG.copyCount,
        drawerPulse: {
            off: typeof source.drawerPulse?.off === 'number' &&
                Number.isFinite(source.drawerPulse.off)
                ? Math.max(0, Math.min(255, Math.round(source.drawerPulse.off)))
                : SAFE_DEFAULT_HARDWARE_CONFIG.drawerPulse.off,
            on: typeof source.drawerPulse?.on === 'number' &&
                Number.isFinite(source.drawerPulse.on)
                ? Math.max(0, Math.min(255, Math.round(source.drawerPulse.on)))
                : SAFE_DEFAULT_HARDWARE_CONFIG.drawerPulse.on,
        },
        port: typeof source.port === 'number' && Number.isFinite(source.port)
            ? Math.max(1, Math.min(65535, Math.round(source.port)))
            : SAFE_DEFAULT_HARDWARE_CONFIG.port,
        target: typeof source.target === 'string' && source.target.trim().length > 0
            ? source.target.trim()
            : SAFE_DEFAULT_HARDWARE_CONFIG.target,
        timeout: typeof source.timeout === 'number' && Number.isFinite(source.timeout)
            ? Math.max(500, Math.min(20000, Math.round(source.timeout)))
            : SAFE_DEFAULT_HARDWARE_CONFIG.timeout,
    };
}
function safeNormalizeHardwareConfig(input) {
    try {
        return (0, hardware_config_1.normalizeHardwareConfig)(input);
    }
    catch {
        return fallbackNormalizeHardwareConfig(input);
    }
}
function safeSerializeHardwareConfig(config) {
    try {
        return (0, hardware_config_1.serializeHardwareConfig)(config);
    }
    catch {
        return JSON.stringify(fallbackNormalizeHardwareConfig(config));
    }
}
function safeParseHardwareConfig(raw) {
    try {
        return (0, hardware_config_1.parseHardwareConfigJson)(raw);
    }
    catch {
        if (!raw) {
            return cloneHardwareConfig(SAFE_DEFAULT_HARDWARE_CONFIG);
        }
        try {
            return safeNormalizeHardwareConfig(JSON.parse(raw));
        }
        catch {
            return cloneHardwareConfig(SAFE_DEFAULT_HARDWARE_CONFIG);
        }
    }
}
function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16).toString('hex');
    const hash = (0, node_crypto_1.scryptSync)(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}
function verifyPassword(password, encodedHash) {
    const [salt, hash] = encodedHash.split(':');
    if (!salt || !hash) {
        return false;
    }
    const computed = (0, node_crypto_1.scryptSync)(password, salt, 64);
    const stored = Buffer.from(hash, 'hex');
    if (stored.length !== computed.length) {
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(stored, computed);
}
function toPendingRecord(row) {
    return {
        createdAt: row.created_at,
        id: row.id,
        payloadData: row.payload_data,
        syncStatus: row.sync_status,
        syncedAt: row.synced_at,
    };
}
function readErrorMessage(error) {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return 'Bilinmeyen hata';
}
function normalizeUiPreset(value) {
    if (value === 'market' || value === 'cafe' || value === 'pide' || value === 'kasap') {
        return value;
    }
    return 'market';
}
function normalizeTouchDensity(value) {
    if (value === 'compact' || value === 'comfortable') {
        return value;
    }
    return 'comfortable';
}
function clampInteger(value, params) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return params.fallback;
    }
    return Math.max(params.min, Math.min(params.max, Math.round(value)));
}
function normalizeBackupPolicy(raw) {
    const source = raw && typeof raw === 'object'
        ? raw
        : {};
    const lastRunAt = typeof source.lastRunAt === 'string' &&
        Number.isFinite(Date.parse(source.lastRunAt))
        ? source.lastRunAt
        : null;
    return {
        enabled: typeof source.enabled === 'boolean'
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
function parseBackupPolicy(raw) {
    if (!raw) {
        return { ...DEFAULT_BACKUP_POLICY };
    }
    try {
        return normalizeBackupPolicy(JSON.parse(raw));
    }
    catch {
        return { ...DEFAULT_BACKUP_POLICY };
    }
}
function buildDefaultSetupState() {
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
function parseSetupResult(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value;
    if ((record.status !== 'FAILED' && record.status !== 'SUCCESS') ||
        typeof record.at !== 'string' ||
        typeof record.message !== 'string') {
        return null;
    }
    return {
        at: record.at,
        message: record.message,
        status: record.status,
    };
}
function normalizeSetupStep(stepId, value) {
    const source = value && typeof value === 'object'
        ? value
        : {};
    const status = source.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING';
    return {
        completedAt: status === 'COMPLETED' && typeof source.completedAt === 'string'
            ? source.completedAt
            : null,
        detail: typeof source.detail === 'string' ? source.detail : null,
        status,
        stepId,
    };
}
function parseSetupState(raw) {
    if (!raw) {
        return buildDefaultSetupState();
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return buildDefaultSetupState();
        }
        if (typeof parsed.setupVersion !== 'number' ||
            parsed.setupVersion !== SETUP_VERSION) {
            return buildDefaultSetupState();
        }
        const byStepId = new Map();
        if (Array.isArray(parsed.steps)) {
            for (const entry of parsed.steps) {
                if (!entry || typeof entry !== 'object') {
                    continue;
                }
                const step = entry;
                const stepId = SETUP_STEP_ORDER.find((candidate) => candidate === step.stepId);
                if (!stepId) {
                    continue;
                }
                byStepId.set(stepId, normalizeSetupStep(stepId, step));
            }
        }
        const steps = SETUP_STEP_ORDER.map((stepId) => byStepId.get(stepId) ?? normalizeSetupStep(stepId, null));
        const isAllCompleted = steps.every((step) => step.status === 'COMPLETED');
        return {
            completedAt: isAllCompleted && typeof parsed.completedAt === 'string'
                ? parsed.completedAt
                : null,
            lastResult: parseSetupResult(parsed.lastResult),
            setupVersion: SETUP_VERSION,
            steps,
        };
    }
    catch {
        return buildDefaultSetupState();
    }
}
function parseCompanyAccessSnapshot(raw) {
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed ||
            typeof parsed.companyId !== 'string' ||
            parsed.companyId.trim().length === 0 ||
            typeof parsed.checkedAt !== 'string' ||
            typeof parsed.offlineAccessValidUntil !== 'string' ||
            typeof parsed.summary !== 'string' ||
            typeof parsed.isAccessAllowed !== 'boolean') {
            return null;
        }
        const status = parsed.status === 'ACTIVE' ||
            parsed.status === 'EXPIRED' ||
            parsed.status === 'GRACE' ||
            parsed.status === 'SUSPENDED' ||
            parsed.status === 'UNCONFIGURED'
            ? parsed.status
            : null;
        const reasonCode = parsed.reasonCode === 'ACTIVE_SUBSCRIPTION' ||
            parsed.reasonCode === 'COMPANY_DISABLED' ||
            parsed.reasonCode === 'NO_PACKAGE_DATES' ||
            parsed.reasonCode === 'PACKAGE_EXPIRED' ||
            parsed.reasonCode === 'PACKAGE_EXPIRED_GRACE' ||
            parsed.reasonCode === 'PACKAGE_SUSPENDED'
            ? parsed.reasonCode
            : null;
        const operatorAction = parsed.operatorAction === 'CHECK_PLAN_DATES' ||
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
            daysRemaining: typeof parsed.daysRemaining === 'number' && Number.isFinite(parsed.daysRemaining)
                ? parsed.daysRemaining
                : null,
            expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : null,
            graceEndsAt: typeof parsed.graceEndsAt === 'string' ? parsed.graceEndsAt : null,
            isAccessAllowed: parsed.isAccessAllowed,
            localLastSeenAt: typeof parsed.localLastSeenAt === 'string' ? parsed.localLastSeenAt : null,
            offlineAccessGraceDays: typeof parsed.offlineAccessGraceDays === 'number' &&
                Number.isFinite(parsed.offlineAccessGraceDays)
                ? parsed.offlineAccessGraceDays
                : 0,
            offlineAccessValidUntil: parsed.offlineAccessValidUntil,
            operatorAction,
            reasonCode,
            status,
            summary: parsed.summary,
        };
    }
    catch {
        return null;
    }
}
class LocalDatabaseService {
    db;
    databasePath;
    constructor(databasePath) {
        this.databasePath = databasePath;
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(databasePath), { recursive: true });
        this.db = new better_sqlite3_1.default(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.initializeSchema();
        if (!this.getSetting(UI_PRESET_KEY)) {
            this.setSetting(UI_PRESET_KEY, 'market');
        }
        if (!this.getSetting(UI_TOUCH_DENSITY_KEY)) {
            this.setSetting(UI_TOUCH_DENSITY_KEY, 'comfortable');
        }
        if (!this.getSetting(HARDWARE_CONFIG_KEY)) {
            this.setSetting(HARDWARE_CONFIG_KEY, safeSerializeHardwareConfig(hardware_config_1.DEFAULT_HARDWARE_CONFIG));
        }
        if (!this.getSetting(BACKUP_POLICY_KEY)) {
            this.setSetting(BACKUP_POLICY_KEY, JSON.stringify(DEFAULT_BACKUP_POLICY));
        }
        if (!this.getSetting(SETUP_STATE_KEY)) {
            this.setSetupState(buildDefaultSetupState());
        }
    }
    getDatabasePath() {
        return this.databasePath;
    }
    cacheOnlineLogin(payload) {
        const now = new Date().toISOString();
        const passwordHash = hashPassword(payload.password);
        this.db.prepare(`
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
      `).run(payload.user.id, payload.user.companyId, payload.user.branchId, payload.user.username, payload.user.fullName, payload.user.role, passwordHash, now);
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
    offlineLogin(username, password, companyId) {
        const row = this.db.prepare(`
      SELECT id, company_id, branch_id, username, full_name, role, is_active, password_hash
      FROM cached_users
      WHERE username = ?
        AND (? IS NULL OR company_id = ?)
      ORDER BY updated_at DESC
      LIMIT 1
      `).get(username, companyId ?? null, companyId ?? null);
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
    getCachedSession() {
        const userId = this.getSetting(AUTH_USER_ID_KEY);
        if (!userId) {
            return null;
        }
        const row = this.db.prepare(`
      SELECT id, company_id, branch_id, username, full_name, role, is_active
      FROM cached_users
      WHERE id = ?
      LIMIT 1
      `).get(userId);
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
    clearCachedSession() {
        this.removeSetting(AUTH_ACCESS_TOKEN_KEY);
        this.removeSetting(AUTH_REFRESH_TOKEN_KEY);
        this.removeSetting(AUTH_USER_ID_KEY);
        this.removeSetting(AUTH_REGISTER_ID_KEY);
        this.removeSetting(AUTH_SESSION_ID_KEY);
    }
    getUiPreset() {
        return normalizeUiPreset(this.getSetting(UI_PRESET_KEY));
    }
    setUiPreset(preset) {
        this.setSetting(UI_PRESET_KEY, preset);
    }
    getTouchDensity() {
        return normalizeTouchDensity(this.getSetting(UI_TOUCH_DENSITY_KEY));
    }
    setTouchDensity(density) {
        this.setSetting(UI_TOUCH_DENSITY_KEY, density);
    }
    getHardwareConfig() {
        const config = safeParseHardwareConfig(this.getSetting(HARDWARE_CONFIG_KEY));
        return cloneHardwareConfig(config);
    }
    setHardwareConfig(config) {
        const normalized = safeNormalizeHardwareConfig(config);
        this.setSetting(HARDWARE_CONFIG_KEY, safeSerializeHardwareConfig(normalized));
    }
    getBackupPolicy() {
        return parseBackupPolicy(this.getSetting(BACKUP_POLICY_KEY));
    }
    setBackupPolicy(policy) {
        const normalized = normalizeBackupPolicy(policy);
        this.setSetting(BACKUP_POLICY_KEY, JSON.stringify(normalized));
        return normalized;
    }
    markBackupPolicyRun(atIso) {
        const current = this.getBackupPolicy();
        const candidate = typeof atIso === 'string' && Number.isFinite(Date.parse(atIso))
            ? atIso
            : new Date().toISOString();
        return this.setBackupPolicy({
            ...current,
            lastRunAt: candidate,
        });
    }
    getSetupState() {
        return parseSetupState(this.getSetting(SETUP_STATE_KEY));
    }
    updateSetupStep(payload) {
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
                detail: typeof payload.detail === 'string'
                    ? payload.detail
                    : payload.detail === null
                        ? null
                        : step.detail,
                status: nextStatus,
            };
        });
        const isAllCompleted = steps.every((step) => step.status === 'COMPLETED');
        const next = {
            completedAt: isAllCompleted ? current.completedAt ?? now : null,
            lastResult: current.lastResult,
            setupVersion: SETUP_VERSION,
            steps,
        };
        this.setSetupState(next);
        return next;
    }
    completeSetup(message) {
        const now = new Date().toISOString();
        const current = this.getSetupState();
        const steps = current.steps.map((step) => step.status === 'COMPLETED'
            ? step
            : { ...step, completedAt: now, status: 'COMPLETED' });
        const next = {
            completedAt: now,
            lastResult: {
                at: now,
                message: typeof message === 'string' && message.trim().length > 0
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
    resetSetup(message) {
        const now = new Date().toISOString();
        const next = buildDefaultSetupState();
        next.lastResult = {
            at: now,
            message: typeof message === 'string' && message.trim().length > 0
                ? message.trim()
                : 'Kurulum sifirlandi.',
            status: 'FAILED',
        };
        this.setSetupState(next);
        return next;
    }
    setCompanyAccessSnapshot(snapshot) {
        if (!snapshot.companyId || snapshot.companyId.trim().length === 0) {
            return;
        }
        this.setSetting(this.getCompanyAccessSettingKey(snapshot.companyId), JSON.stringify(snapshot));
    }
    getCompanyAccessSnapshot(companyId) {
        if (!companyId || companyId.trim().length === 0) {
            return null;
        }
        return parseCompanyAccessSnapshot(this.getSetting(this.getCompanyAccessSettingKey(companyId)));
    }
    saveLastReceiptPayload(payload) {
        if (payload.lines.length === 0) {
            return;
        }
        this.setSetting(LAST_RECEIPT_PAYLOAD_KEY, JSON.stringify({
            copyCount: payload.copyCount,
            lines: payload.lines,
        }));
    }
    getLastReceiptPayload() {
        const raw = this.getSetting(LAST_RECEIPT_PAYLOAD_KEY);
        if (!raw) {
            return null;
        }
        try {
            const parsed = JSON.parse(raw);
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
                copyCount: typeof parsed.copyCount === 'number' && Number.isFinite(parsed.copyCount)
                    ? parsed.copyCount
                    : undefined,
                lines,
            };
        }
        catch {
            return null;
        }
    }
    verifyManagerUnlock(payload) {
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
    setManagerPin(pin) {
        if (!/^\d{4}$/u.test(pin)) {
            throw new Error('Yonetici PIN 4 haneli olmalidir.');
        }
        this.setSetting(MANAGER_UNLOCK_PIN_HASH_KEY, hashPassword(pin));
        this.setSetting(MANAGER_UNLOCK_PIN_UPDATED_AT_KEY, new Date().toISOString());
    }
    upsertSyncData(payload) {
        const now = new Date().toISOString();
        const tx = this.db.transaction(() => {
            const upsertUser = this.db.prepare(`
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
        `);
            const upsertCategory = this.db.prepare(`
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
        `);
            const upsertProduct = this.db.prepare(`
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
        `);
            for (const user of payload.users) {
                upsertUser.run(user.id, user.companyId, user.branchId, user.username, user.fullName, user.role, user.isActive ? 1 : 0, now);
            }
            for (const category of payload.categories) {
                upsertCategory.run(category.id, category.companyId, category.name, category.parentId, category.sortOrder, category.color, now);
            }
            for (const product of payload.products) {
                upsertProduct.run(product.id, product.companyId, product.categoryId, product.barcode, product.name, product.salePrice, product.vatRate, product.isQuickAccess ? 1 : 0, product.quickAccessColor, product.quickAccessOrder, 1, now);
            }
        });
        tx();
    }
    listCachedProducts(options) {
        const rows = this.db.prepare(`
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
      `).all(options.companyId, options.categoryId ?? null, options.categoryId ?? null, options.quickAccessOnly ? 1 : 0, options.search ?? null, options.search ?? null, options.search ?? null);
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
    listCachedCategories(companyId) {
        const rows = this.db.prepare(`
      SELECT id, company_id, name, parent_id, sort_order, color
      FROM cached_categories
      WHERE company_id = ?
      ORDER BY sort_order ASC, name ASC
      `).all(companyId);
        return rows.map((row) => ({
            color: row.color,
            companyId: row.company_id,
            id: row.id,
            name: row.name,
            parentId: row.parent_id,
            sortOrder: row.sort_order,
        }));
    }
    queueSale(sale, localId) {
        return this.queuePayload('local_sales', sale, localId);
    }
    queueRefund(refund, localId) {
        return this.queuePayload('local_refunds', refund, localId);
    }
    listPendingSales(limit = 200) {
        return this.listPendingQueue('local_sales', limit).map((row) => toPendingRecord(row));
    }
    listPendingRefunds(limit = 200) {
        return this.listPendingQueue('local_refunds', limit).map((row) => toPendingRecord(row));
    }
    markSalesSynced(ids) {
        return this.markQueueSynced('local_sales', ids);
    }
    markRefundsSynced(ids) {
        return this.markQueueSynced('local_refunds', ids);
    }
    markSaleFailed(id, errorMessage) {
        return this.markQueueFailed('local_sales', id, errorMessage);
    }
    markRefundFailed(id, errorMessage) {
        return this.markQueueFailed('local_refunds', id, errorMessage);
    }
    getQueueCounts() {
        const sales = this.db.prepare(`SELECT COUNT(1) as total FROM local_sales WHERE sync_status IN ('PENDING','FAILED')`).get();
        const refunds = this.db.prepare(`SELECT COUNT(1) as total FROM local_refunds WHERE sync_status IN ('PENDING','FAILED')`).get();
        return { refunds: refunds.total, sales: sales.total };
    }
    getLastSyncAt() {
        return this.getSetting('last_sync_at');
    }
    setLastSyncAt(value) {
        this.setSetting('last_sync_at', value);
    }
    async createBackup(targetPath) {
        this.db.pragma('wal_checkpoint(FULL)');
        const escapedTargetPath = targetPath.replace(/'/g, "''");
        this.db.exec(`VACUUM INTO '${escapedTargetPath}'`);
    }
    logSecurityEvent(payload) {
        const id = (0, node_crypto_1.randomUUID)();
        const createdAt = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO local_security_events (
        id, event_type, severity, message, operator_user_id, manager_user_id, reason, metadata_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, payload.eventType, payload.severity, payload.message, payload.operatorUserId ?? null, payload.managerUserId ?? null, payload.reason ?? null, payload.metadataJson ?? null, createdAt);
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
    listSecurityEvents(limit = 100) {
        const safeLimit = Math.max(1, Math.min(500, Math.round(limit)));
        const rows = this.db.prepare(`
      SELECT id, event_type, severity, message, operator_user_id, manager_user_id, reason, metadata_json, created_at
      FROM local_security_events
      ORDER BY created_at DESC
      LIMIT ?
      `).all(safeLimit);
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
    recordShiftHandover(payload) {
        const id = (0, node_crypto_1.randomUUID)();
        const createdAt = new Date().toISOString();
        const expectedCash = Number(payload.expectedCash);
        const declaredCash = Number(payload.declaredCash);
        const difference = declaredCash - expectedCash;
        this.db.prepare(`
      INSERT INTO local_shift_handovers (
        id, register_id, operator_user_id, manager_user_id, expected_cash, declared_cash, difference, blind_close, note, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, payload.registerId, payload.operatorUserId, payload.managerUserId ?? null, expectedCash, declaredCash, difference, payload.blindClose ? 1 : 0, payload.note ?? null, createdAt);
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
    listShiftHandovers(registerId, limit = 100) {
        const safeLimit = Math.max(1, Math.min(500, Math.round(limit)));
        const rows = this.db.prepare(`
      SELECT id, register_id, operator_user_id, manager_user_id, expected_cash, declared_cash, difference, blind_close, note, created_at
      FROM local_shift_handovers
      WHERE (? IS NULL OR register_id = ?)
      ORDER BY created_at DESC
      LIMIT ?
      `).all(registerId ?? null, registerId ?? null, safeLimit);
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
    recordCashMovement(payload) {
        const id = (0, node_crypto_1.randomUUID)();
        const createdAt = new Date().toISOString();
        const amount = Math.abs(Number(payload.amount));
        this.db.prepare(`
      INSERT INTO local_cash_movements (
        id, register_id, operator_user_id, movement_type, amount, note, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, payload.registerId, payload.operatorUserId, payload.movementType, amount, payload.note ?? null, createdAt);
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
    listCashMovements(registerId, limit = 100) {
        const safeLimit = Math.max(1, Math.min(500, Math.round(limit)));
        const rows = this.db.prepare(`
      SELECT id, register_id, operator_user_id, movement_type, amount, note, created_at
      FROM local_cash_movements
      WHERE (? IS NULL OR register_id = ?)
      ORDER BY created_at DESC
      LIMIT ?
      `).all(registerId ?? null, registerId ?? null, safeLimit);
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
    close() {
        this.db.close();
    }
    resolveManagerUser(username, companyId) {
        return this.resolveManagerUserWithHash(username, companyId).user;
    }
    resolveManagerUserWithHash(username, companyId) {
        const row = this.db.prepare(`
      SELECT id, company_id, branch_id, username, full_name, role, is_active, password_hash
      FROM cached_users
      WHERE (? IS NULL OR company_id = ?)
        AND (? IS NULL OR username = ?)
        AND role IN ('ADMIN', 'SUPER_ADMIN')
        AND is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1
      `).get(companyId ?? null, companyId ?? null, username ?? null, username ?? null);
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
    queuePayload(table, payload, localId) {
        const id = localId ?? (0, node_crypto_1.randomUUID)();
        const now = new Date().toISOString();
        const payloadData = JSON.stringify(payload);
        this.db.prepare(`
      INSERT INTO ${table} (id, payload_data, sync_status, created_at, updated_at)
      VALUES (?, ?, 'PENDING', ?, ?)
      `).run(id, payloadData, now, now);
        return {
            createdAt: now,
            id,
            payloadData,
            syncStatus: 'PENDING',
            syncedAt: null,
        };
    }
    listPendingQueue(table, limit) {
        return this.db.prepare(`
      SELECT id, payload_data, sync_status, created_at, synced_at
      FROM ${table}
      WHERE sync_status IN ('PENDING','FAILED')
      ORDER BY created_at ASC
      LIMIT ?
      `).all(limit);
    }
    markQueueSynced(table, ids) {
        if (ids.length === 0) {
            return 0;
        }
        const now = new Date().toISOString();
        const placeholders = ids.map(() => '?').join(', ');
        const result = this.db.prepare(`
      UPDATE ${table}
      SET sync_status = 'SYNCED', sync_error = NULL, synced_at = ?, updated_at = ?
      WHERE id IN (${placeholders})
      `).run(now, now, ...ids);
        return Number(result.changes ?? 0);
    }
    markQueueFailed(table, id, errorMessage) {
        const now = new Date().toISOString();
        const result = this.db.prepare(`
      UPDATE ${table}
      SET sync_status = 'FAILED', sync_error = ?, updated_at = ?
      WHERE id = ?
      `).run(errorMessage, now, id);
        return Number(result.changes ?? 0);
    }
    getSetting(key) {
        const row = this.db.prepare(`
      SELECT value FROM app_settings WHERE key = ? LIMIT 1
      `).get(key);
        return row?.value ?? null;
    }
    setSetting(key, value) {
        this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(key, value, new Date().toISOString());
    }
    removeSetting(key) {
        this.db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(key);
    }
    setSetupState(state) {
        this.setSetting(SETUP_STATE_KEY, JSON.stringify(state));
    }
    getCompanyAccessSettingKey(companyId) {
        return `${COMPANY_ACCESS_KEY_PREFIX}${companyId}`;
    }
    initializeSchema() {
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
        }
        catch (error) {
            throw new Error(`SQLite schema initialization failed: ${readErrorMessage(error)}`);
        }
    }
}
exports.LocalDatabaseService = LocalDatabaseService;
//# sourceMappingURL=database.js.map