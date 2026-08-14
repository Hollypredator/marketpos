import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

import {
  IPC_CHANNELS,
  type BackupPolicy,
  type BackupPolicyState,
  type BackupRestorePayload,
  type CacheLoginPayload,
  type HardwareConfig,
  type ListOpsQuery,
  type LogSecurityEventPayload,
  type ManagerUnlockPayload,
  type ListCachedProductsOptions,
  type QueueProductOpPayload,
  type QueueRefundPayload,
  type QueueSalePayload,
  type QueueStockOpPayload,
  type RecordCashMovementPayload,
  type RecordShiftHandoverPayload,
  type RuntimeInfo,
  type SetupStepUpdatePayload,
  type UpdateAuthTokensPayload,
  type UiPresetState,
} from './ipc';
import type { TouchDensity, UiPreset } from './services/database';
import type { CashDrawerOpenOptions } from './services/cash-drawer';
import { CashDrawerService } from './services/cash-drawer';
import { LocalDatabaseService, initDatabaseService, type UpsertSyncDataPayload } from './services/database';
import { PrinterService, type ReceiptPrintPayload } from './services/printer';
import { SyncService, type SyncRunOptions, type SyncRunResult } from './services/sync';
import { getAutomationService } from './services/automation';
import { SecurityService } from './services/security';
import { EInvoiceService } from './services/e-invoice';
import { YNOKCManager } from './services/yn-okc';

// Load .env variables from the app data folder or next to the executable
function loadLocalEnv(): void {
  const paths: string[] = [];
  try {
    paths.push(join(app.getPath('userData'), '.env'));
  } catch (e) {
    // ignore if path cannot be retrieved yet
  }
  try {
    // Path next to executable in production
    paths.push(join(app.getAppPath(), '..', '..', '.env'));
    // Path inside package in dev mode
    paths.push(join(app.getAppPath(), '.env'));
  } catch (e) {
    // ignore
  }

  for (const filePath of paths) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const index = trimmed.indexOf('=');
          if (index > 0) {
            const key = trimmed.slice(0, index).trim();
            let val = trimmed.slice(index + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (e) {
        // ignore errors reading file
      }
    }
  }
}

// Execute env loading immediately at boot time
loadLocalEnv();

const IS_DEV = !app.isPackaged;
const DEFAULT_API_BASE_URL = process.env.MARKETPOS_API_BASE_URL ?? 'https://marketpos-api-fiq6.onrender.com';
const DEFAULT_RENDERER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5175';
const SYNC_V2_ENABLED = (process.env.SYNC_V2_ENABLED ?? 'false').toLowerCase() === 'true';

let databaseService: LocalDatabaseService | null = null;
let mainWindow: BrowserWindow | null = null;
let syncService: SyncService | null = null;
let autoBackupTimer: NodeJS.Timeout | null = null;
let autoBackupInFlight = false;
let nextAutoBackupAt: string | null = null;
let autoUpdateTimer: NodeJS.Timeout | null = null;
let syncHeartbeatTimer: NodeJS.Timeout | null = null;
let autoUpdateConfigured = false;
let securityService: SecurityService | null = null;
let eInvoiceService: EInvoiceService | null = null;
let ynOkcManager: YNOKCManager | null = null;
const cashDrawerService = new CashDrawerService({
  getHardwareConfig: () => getDatabaseService().getHardwareConfig(),
});
const printerService = new PrinterService({
  getHardwareConfig: () => getDatabaseService().getHardwareConfig(),
});
const AUTO_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SYNC_HEARTBEAT_INTERVAL_MS = 60 * 1000;

interface OfflineLoginPayload {
  companyId?: string;
  password: string;
  username: string;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Bilinmeyen hata';
}

function isSqliteCorruptionError(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes('database disk image is malformed') ||
    message.includes('sqlite_corrupt') ||
    message.includes('database corruption')
  );
}

function closeDatabaseServiceSafely(): void {
  if (!databaseService) {
    return;
  }
  try {
    databaseService.close();
  } catch {
    // no-op
  } finally {
    databaseService = null;
  }
}

function restoreDatabaseFromBackupFile(backupPath: string, databasePath: string): void {
  copyFileSync(backupPath, databasePath);
  rmSync(`${databasePath}-wal`, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
}

function attemptSqliteRecovery(trigger: 'DB_OPEN' | 'SYNC_RUN'): {
  message: string;
  recovered: boolean;
} {
  const databasePath = join(app.getPath('userData'), 'marketpos.db.sqlite');
  const recoverDetails: string[] = [];

  closeDatabaseServiceSafely();

  const backups = listBackupRecords();
  for (const backup of backups) {
    try {
      restoreDatabaseFromBackupFile(backup.path, databasePath);
      databaseService = initDatabaseService(databasePath);
      databaseService.resetSyncCheckpoint();
      databaseService.logSecurityEvent({
        eventType: 'DB_AUTO_RECOVERED_FROM_BACKUP',
        message: `SQLite bozulmasi otomatik geri yuklendi (${backup.fileName})`,
        metadataJson: JSON.stringify({
          backupFile: backup.fileName,
          trigger,
        }),
        severity: 'WARN',
      });
      return {
        message: `Yedekten geri yuklendi: ${backup.fileName}`,
        recovered: true,
      };
    } catch (error: unknown) {
      recoverDetails.push(`${backup.fileName}: ${readErrorMessage(error)}`);
      closeDatabaseServiceSafely();
    }
  }

  try {
    if (existsSync(databasePath)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const corruptCopyPath = join(
        app.getPath('userData'),
        `marketpos-corrupt-${stamp}.sqlite`,
      );
      copyFileSync(databasePath, corruptCopyPath);
    }
    rmSync(databasePath, { force: true });
    rmSync(`${databasePath}-wal`, { force: true });
    rmSync(`${databasePath}-shm`, { force: true });
    databaseService = initDatabaseService(databasePath);
    databaseService.resetSyncCheckpoint();
    databaseService.logSecurityEvent({
      eventType: 'DB_RECREATED_AFTER_CORRUPTION',
      message: 'SQLite bozulmasi sonrasi yeni lokal veritabani olusturuldu',
      metadataJson: JSON.stringify({ trigger }),
      severity: 'WARN',
    });
    return {
      message: 'Yedek bulunamadi; yeni lokal veritabani olusturuldu.',
      recovered: true,
    };
  } catch (error: unknown) {
    recoverDetails.push(`recreate: ${readErrorMessage(error)}`);
    return {
      message: `Otomatik onarim basarisiz: ${recoverDetails.join(' | ')}`,
      recovered: false,
    };
  }
}

function buildSyncFailureResult(message: string, usedCursor: string | null): SyncRunResult {
  return {
    errors: [message],
    failedCustomerOpIds: [],
    failedPurchaseOpIds: [],
    failedProductOpIds: [],
    failedRefundIds: [],
    failedSaleIds: [],
    failedSupplierOpIds: [],
    failedStockOpIds: [],
    nextCursor: null,
    pulledBundles: 0,
    pulledCategories: [],
    pulledCustomers: 0,
    pulledProducts: [],
    pulledPurchaseInvoiceItems: 0,
    pulledPurchaseInvoices: 0,
    pulledSuppliers: [],
    pulledUsers: [],
    pushSummary: {
      acceptedCount: 0,
      errors: [message],
      failedCount: 1,
      replayedCount: 0,
      serverSyncAt: new Date().toISOString(),
    },
    pushedAccepted: 0,
    pushedCustomerOpIds: [],
    pushedCustomerOps: 0,
    pushedFailed: 1,
    pushedPurchaseOpIds: [],
    pushedPurchaseOps: 0,
    pushedProductOpIds: [],
    pushedProductOps: 0,
    pushedRefundIds: [],
    pushedRefunds: 0,
    pushedReplayed: 0,
    pushedSaleIds: [],
    pushedSales: 0,
    pushedStockOpIds: [],
    pushedStockOps: 0,
    pushedSupplierOpIds: [],
    pushedSupplierOps: 0,
    resultsByEntity: {
      customerOps: [],
      productOps: [],
      purchaseOps: [],
      refunds: [],
      sales: [],
      stockOps: [],
      supplierOps: [],
    },
    success: false,
    syncedAt: new Date().toISOString(),
    usedCursor,
  };
}

function getDatabaseService(): LocalDatabaseService {
  if (databaseService) {
    return databaseService;
  }
  const databasePath = join(app.getPath('userData'), 'marketpos.db.sqlite');
  try {
    databaseService = initDatabaseService(databasePath);
    const integrity = databaseService.runIntegrityCheck();
    if (!integrity.ok) {
      throw new Error(`sqlite quick_check failed: ${integrity.detail}`);
    }
  } catch (error: unknown) {
    if (!isSqliteCorruptionError(error)) {
      throw error;
    }
    const recovery = attemptSqliteRecovery('DB_OPEN');
    if (!recovery.recovered || !databaseService) {
      throw new Error(`SQLite bozulmasi giderilemedi: ${recovery.message}`);
    }
    console.warn(`[db-recovery] ${recovery.message}`);
  }
  return databaseService;
}

function getSyncService(): SyncService {
  if (syncService) {
    return syncService;
  }
  syncService = new SyncService({
    apiBaseUrl: DEFAULT_API_BASE_URL,
    syncV2Enabled: SYNC_V2_ENABLED,
  });
  return syncService;
}

function getSecurityService(): SecurityService {
  if (securityService) {
    return securityService;
  }
  securityService = new SecurityService(getDatabaseService());
  return securityService;
}

function getEInvoiceService(): EInvoiceService {
  if (eInvoiceService) {
    return eInvoiceService;
  }
  eInvoiceService = new EInvoiceService();
  return eInvoiceService;
}

function getYNOKCManager(): YNOKCManager {
  if (ynOkcManager) {
    return ynOkcManager;
  }
  ynOkcManager = new YNOKCManager();
  return ynOkcManager;
}

function getBackupDirectoryPath(): string {
  const backupDir = join(app.getPath('userData'), 'backups');
  mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function createBackupFileName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `marketpos-backup-${stamp}.sqlite`;
}

function toBackupRecord(fileName: string, absolutePath: string): {
  createdAt: string;
  fileName: string;
  path: string;
  sizeBytes: number;
} {
  const stat = statSync(absolutePath);
  return {
    createdAt: stat.mtime.toISOString(),
    fileName,
    path: absolutePath,
    sizeBytes: stat.size,
  };
}

function listBackupRecords(): Array<{
  createdAt: string;
  fileName: string;
  path: string;
  sizeBytes: number;
}> {
  const backupDir = getBackupDirectoryPath();
  const files = readdirSync(backupDir)
    .filter((name) => name.endsWith('.sqlite'))
    .map((fileName) => {
      const absolutePath = join(backupDir, fileName);
      return toBackupRecord(fileName, absolutePath);
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return files;
}

function asBackupPolicyState(policy: BackupPolicy): BackupPolicyState {
  return {
    ...policy,
    nextRunAt: policy.enabled ? nextAutoBackupAt : null,
  };
}

function clearAutoBackupTimer(): void {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
  nextAutoBackupAt = null;
}

function computeNextAutoBackupAt(intervalHours: number): string {
  return new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString();
}

function enforceBackupRetention(policy: BackupPolicy): void {
  const backupDir = getBackupDirectoryPath();
  const backupDirLower = backupDir.toLowerCase();
  const backups = listBackupRecords();
  const nowMs = Date.now();
  const ageCutoffMs = nowMs - policy.retentionDays * 24 * 60 * 60 * 1000;
  const removeTargets = new Set<string>();

  for (const backup of backups) {
    const createdAtMs = Date.parse(backup.createdAt);
    if (Number.isFinite(createdAtMs) && createdAtMs < ageCutoffMs) {
      removeTargets.add(backup.path);
    }
  }

  const remaining = backups.filter((backup) => !removeTargets.has(backup.path));
  if (remaining.length > policy.maxBackups) {
    for (const staleBackup of remaining.slice(policy.maxBackups)) {
      removeTargets.add(staleBackup.path);
    }
  }

  for (const targetPath of removeTargets) {
    const normalized = targetPath.toLowerCase();
    if (!normalized.startsWith(backupDirLower)) {
      continue;
    }
    rmSync(targetPath, { force: true });
  }
}

async function createLocalBackup(params: {
  trigger: 'AUTO_INTERVAL' | 'AUTO_STARTUP' | 'MANUAL';
}): Promise<{
  createdAt: string;
  fileName: string;
  path: string;
  sizeBytes: number;
}> {
  const db = getDatabaseService();
  const backupDir = getBackupDirectoryPath();
  const fileName = createBackupFileName();
  const absolutePath = join(backupDir, fileName);
  await db.createBackup(absolutePath);
  const backupValidation = db.validateBackupFile(absolutePath);
  if (!backupValidation.ok) {
    rmSync(absolutePath, { force: true });
    throw new Error(`Yedek dogrulamasi basarisiz: ${backupValidation.detail}`);
  }
  db.markBackupPolicyRun();

  const policy = db.getBackupPolicy();
  enforceBackupRetention(policy);

  const eventType =
    params.trigger === 'MANUAL' ? 'BACKUP_CREATED' : 'BACKUP_AUTO_CREATED';
  const message =
    params.trigger === 'MANUAL'
      ? `Lokal yedek olusturuldu: ${fileName}`
      : `Otomatik yedek olusturuldu: ${fileName}`;

  db.logSecurityEvent({
    eventType,
    message,
    metadataJson: JSON.stringify({
      backupValidation: backupValidation.detail,
      fileName,
      path: absolutePath,
      trigger: params.trigger,
    }),
    severity: 'INFO',
  });

  return toBackupRecord(fileName, absolutePath);
}

async function runScheduledAutoBackup(
  trigger: 'AUTO_INTERVAL' | 'AUTO_STARTUP',
): Promise<void> {
  if (autoBackupInFlight) {
    return;
  }
  autoBackupInFlight = true;
  try {
    await createLocalBackup({ trigger });
  } catch (error: unknown) {
    const db = getDatabaseService();
    db.logSecurityEvent({
      eventType: 'BACKUP_AUTO_FAILED',
      message: `Otomatik yedekleme basarisiz: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
      metadataJson: JSON.stringify({ trigger }),
      severity: 'WARN',
    });
  } finally {
    autoBackupInFlight = false;
    refreshAutoBackupScheduler(false);
  }
}

function shouldRunStartupAutoBackup(policy: BackupPolicy): boolean {
  if (!policy.enabled) {
    return false;
  }
  if (!policy.lastRunAt) {
    return true;
  }
  const lastRunAtMs = Date.parse(policy.lastRunAt);
  if (!Number.isFinite(lastRunAtMs)) {
    return true;
  }
  const elapsedMs = Date.now() - lastRunAtMs;
  const intervalMs = policy.intervalHours * 60 * 60 * 1000;
  return elapsedMs >= intervalMs;
}

function refreshAutoBackupScheduler(runStartupCheck: boolean): void {
  clearAutoBackupTimer();
  const policy = getDatabaseService().getBackupPolicy();
  if (!policy.enabled) {
    return;
  }

  const intervalMs = policy.intervalHours * 60 * 60 * 1000;
  nextAutoBackupAt = computeNextAutoBackupAt(policy.intervalHours);
  autoBackupTimer = setInterval(() => {
    void runScheduledAutoBackup('AUTO_INTERVAL');
  }, intervalMs);

  if (runStartupCheck && shouldRunStartupAutoBackup(policy)) {
    void runScheduledAutoBackup('AUTO_STARTUP');
  }
}

function clearAutoUpdateTimer(): void {
  if (autoUpdateTimer) {
    clearInterval(autoUpdateTimer);
    autoUpdateTimer = null;
  }
}

function clearSyncHeartbeatTimer(): void {
  if (syncHeartbeatTimer) {
    clearInterval(syncHeartbeatTimer);
    syncHeartbeatTimer = null;
  }
}

function resolveHeartbeatContext(params?: {
  accessToken?: string;
  registerId?: string;
}): { accessToken: string; registerId: string } | null {
  const db = getDatabaseService();
  const cachedSession = db.getCachedSession();
  const accessToken = params?.accessToken ?? cachedSession?.accessToken ?? null;
  const registerId = params?.registerId ?? cachedSession?.registerId ?? null;
  if (!accessToken || !registerId) {
    return null;
  }
  return {
    accessToken,
    registerId,
  };
}

async function sendSyncHeartbeatBestEffort(params?: {
  accessToken?: string;
  registerId?: string;
}): Promise<void> {
  const context = resolveHeartbeatContext(params);
  if (!context) {
    return;
  }

  const db = getDatabaseService();
  const syncSummary = db.getSyncStatusSummary();
  const sync = getSyncService();
  sync.setAccessToken(context.accessToken);

  try {
    await sync.sendHeartbeat({
      clientObservedAt: new Date().toISOString(),
      lastSyncErrorCode: syncSummary.lastSyncErrorCode,
      lastSyncedAt: syncSummary.lastSyncedAt,
      lastSyncStatus: syncSummary.lastSyncStatus,
      oldestPendingAgeSec: syncSummary.oldestPendingAgeSec,
      pendingCount: syncSummary.pendingCount,
      productOps: syncSummary.productOps,
      queuePeak: syncSummary.queuePeak,
      refunds: syncSummary.refunds,
      registerId: context.registerId,
      sales: syncSummary.sales,
      stockOps: syncSummary.stockOps,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
    console.warn(`[sync-heartbeat] gonderim basarisiz: ${message}`);
  }
}

function configureSyncHeartbeatScheduler(): void {
  clearSyncHeartbeatTimer();
  syncHeartbeatTimer = setInterval(() => {
    void sendSyncHeartbeatBestEffort();
  }, SYNC_HEARTBEAT_INTERVAL_MS);
}

function logAutoUpdateEvent(params: {
  details?: Record<string, unknown>;
  eventType: string;
  message: string;
  severity: 'INFO' | 'WARN';
}): void {
  try {
    getDatabaseService().logSecurityEvent({
      eventType: params.eventType,
      message: params.message,
      metadataJson: params.details ? JSON.stringify(params.details) : null,
      severity: params.severity,
    });
  } catch {
    // Auto-update telemetry should never block app startup.
  }
}

function isAutoUpdateConfigured(): boolean {
  const envFeedUrl = process.env.MARKETPOS_UPDATE_FEED_URL?.trim();
  if (envFeedUrl && envFeedUrl.length > 0) {
    return true;
  }
  const appUpdateConfigPath = join(process.resourcesPath, 'app-update.yml');
  return existsSync(appUpdateConfigPath);
}

async function checkForUpdates(trigger: 'INTERVAL' | 'STARTUP'): Promise<void> {
  if (!autoUpdateConfigured) {
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
    logAutoUpdateEvent({
      details: { trigger },
      eventType: 'AUTO_UPDATE_CHECK',
      message: `Auto-update kontrolu calisti (${trigger.toLocaleLowerCase('tr-TR')}).`,
      severity: 'INFO',
    });
  } catch (error: unknown) {
    logAutoUpdateEvent({
      details: {
        error: error instanceof Error ? error.message : 'Bilinmeyen hata',
        trigger,
      },
      eventType: 'AUTO_UPDATE_CHECK_FAILED',
      message: 'Auto-update kontrolu basarisiz.',
      severity: 'WARN',
    });
  }
}

function configureAutoUpdate(): void {
  clearAutoUpdateTimer();
  if (IS_DEV) {
    return;
  }
  if (!isAutoUpdateConfigured()) {
    logAutoUpdateEvent({
      eventType: 'AUTO_UPDATE_SKIPPED',
      message:
        'Auto-update feed tanimi bulunamadi. MARKETPOS_UPDATE_FEED_URL veya app-update.yml gerekli.',
      severity: 'WARN',
    });
    return;
  }
  if (autoUpdateConfigured) {
    return;
  }

  const envFeedUrl = process.env.MARKETPOS_UPDATE_FEED_URL?.trim() || `${DEFAULT_API_BASE_URL}/updates`;
  if (envFeedUrl) {
    try {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: envFeedUrl,
      });
    } catch (error: unknown) {
      logAutoUpdateEvent({
        details: { error: error instanceof Error ? error.message : 'Bilinmeyen hata' },
        eventType: 'AUTO_UPDATE_FEED_CONFIG_FAILED',
        message: 'Auto-update feed konfigurasyonu basarisiz.',
        severity: 'WARN',
      });
      return;
    }
  }


  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logAutoUpdateEvent({
      details: { version: info.version },
      eventType: 'AUTO_UPDATE_AVAILABLE',
      message: `Yeni surum bulundu: ${info.version}`,
      severity: 'INFO',
    });
  });

  autoUpdater.on('update-not-available', () => {
    logAutoUpdateEvent({
      eventType: 'AUTO_UPDATE_NOT_AVAILABLE',
      message: 'Yeni surum bulunamadi.',
      severity: 'INFO',
    });
  });

  autoUpdater.on('error', (error) => {
    logAutoUpdateEvent({
      details: { error: error.message },
      eventType: 'AUTO_UPDATE_ERROR',
      message: 'Auto-update hatasi olustu.',
      severity: 'WARN',
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    logAutoUpdateEvent({
      details: { version: info.version },
      eventType: 'AUTO_UPDATE_DOWNLOADED',
      message: `Yeni surum indirildi: ${info.version}`,
      severity: 'INFO',
    });

    const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!targetWindow || targetWindow.isDestroyed()) {
      autoUpdater.quitAndInstall(false, true);
      return;
    }

    const { response } = await dialog.showMessageBox(targetWindow, {
      buttons: ['Simdi Yeniden Baslat', 'Daha Sonra'],
      cancelId: 1,
      defaultId: 0,
      message: 'Yeni surum indirildi. Degisiklikleri uygulamak icin uygulama yeniden baslatilsin mi?',
      title: 'Guncelleme Hazir',
      type: 'info',
    });
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdateConfigured = true;
  void checkForUpdates('STARTUP');
  autoUpdateTimer = setInterval(() => {
    void checkForUpdates('INTERVAL');
  }, AUTO_UPDATE_INTERVAL_MS);
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    backgroundColor: '#0F172A',
    height: 900,
    minHeight: 700,
    minWidth: 1100,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.js'),
      sandbox: false,
      webSecurity: true,
    },
    width: 1400,
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (IS_DEV) {
      const targetOrigin = new URL(DEFAULT_RENDERER_URL).origin;
      const currentOrigin = new URL(url).origin;
      if (currentOrigin !== targetOrigin) {
        event.preventDefault();
      }
      return;
    }
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (IS_DEV) {
    void window.loadURL(DEFAULT_RENDERER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(join(__dirname, '../dist/index.html'));
  }
  return window;
}

function buildHardwareTestReceiptLines(config: HardwareConfig): string[] {
  return [
    'MARKETPOS HARDWARE TEST',
    `Tarih: ${new Date().toLocaleString('tr-TR')}`,
    `Mod: ${config.connectionMode}`,
    `Hedef: ${config.target}`,
    config.connectionMode === 'LAN' ? `Port: ${config.port}` : 'Port: N/A',
    `Timeout: ${config.timeout}ms`,
    `Kopya: ${config.copyCount}`,
    `Pulse: on=${config.drawerPulse.on} off=${config.drawerPulse.off}`,
    '-----------------------------',
    'Yazici testi basarili.',
  ];
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_ENSURE_INTERACTIVE, async () => {
    const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!window || window.isDestroyed()) {
      return;
    }
    window.setIgnoreMouseEvents(false);
    window.setFocusable(true);
    window.focus();
    window.webContents.focus();
  });

  ipcMain.handle(IPC_CHANNELS.APP_RUNTIME_INFO, async (): Promise<RuntimeInfo> => {
    const db = getDatabaseService();
    const setupState = db.getSetupState();
    const syncSummary = db.getSyncStatusSummary();
    return {
      apiBaseUrl: DEFAULT_API_BASE_URL,
      databasePath: db.getDatabasePath(),
      isPackaged: app.isPackaged,
      lastSyncedAt: syncSummary.lastSyncedAt,
      lastSyncStatus: syncSummary.lastSyncStatus,
      offlineReadinessPassed: setupState.offlineReadinessPassed,
      pendingCount: syncSummary.pendingCount,
      platform: process.platform,
      setupMetrics: setupState.setupMetrics,
      userDataPath: app.getPath('userData'),
      version: app.getVersion(),
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.APP_GET_UI_PRESET,
    async (): Promise<UiPresetState> => ({
      touchDensity: getDatabaseService().getTouchDensity(),
      uiPreset: getDatabaseService().getUiPreset(),
    }),
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_SET_UI_PRESET,
    async (
      _event,
      payload: { touchDensity?: TouchDensity; uiPreset: UiPreset },
    ) => {
      getDatabaseService().setUiPreset(payload.uiPreset);
      if (payload.touchDensity) {
        getDatabaseService().setTouchDensity(payload.touchDensity);
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.BACKOFFICE_GET_SETTINGS, async () =>
    getDatabaseService().getBackofficeSettings(),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKOFFICE_SET_SETTINGS,
    async (_event, payload: { operatorUserId?: string | null; patch: unknown }) =>
      getDatabaseService().setBackofficeSettings({
        operatorUserId: payload?.operatorUserId ?? null,
        patch:
          payload && typeof payload.patch === 'object' && payload.patch !== null
            ? (payload.patch as any)
            : {},
      }),
  );

  ipcMain.handle(IPC_CHANNELS.BACKUP_LIST, async () => listBackupRecords());

  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, async () => {
    const backup = await createLocalBackup({ trigger: 'MANUAL' });
    refreshAutoBackupScheduler(false);
    return backup;
  });

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_GET_POLICY,
    async (): Promise<BackupPolicyState> =>
      asBackupPolicyState(getDatabaseService().getBackupPolicy()),
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_SET_POLICY,
    async (_event, payload: BackupPolicy): Promise<BackupPolicyState> => {
      const db = getDatabaseService();
      const normalized = db.setBackupPolicy(payload);
      refreshAutoBackupScheduler(false);
      return asBackupPolicyState(normalized);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_RESTORE,
    async (_event, payload: BackupRestorePayload) => {
      const backupDir = getBackupDirectoryPath();
      const fileName = payload.fileName;
      if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        throw new Error('Gecersiz yedek dosyasi.');
      }
      const absolutePath = join(backupDir, fileName);
      if (!existsSync(absolutePath)) {
        throw new Error('Secili yedek dosyasi bulunamadi.');
      }

      if (databaseService) {
        databaseService.close();
        databaseService = null;
      }

      const databasePath = join(app.getPath('userData'), 'marketpos.db.sqlite');
      copyFileSync(absolutePath, databasePath);
      rmSync(`${databasePath}-wal`, { force: true });
      rmSync(`${databasePath}-shm`, { force: true });

      const db = getDatabaseService();
      db.logSecurityEvent({
        eventType: 'BACKUP_RESTORED',
        message: `Lokal yedek geri yuklendi: ${fileName}`,
        metadataJson: JSON.stringify({ fileName, path: absolutePath }),
        severity: 'WARN',
      });
      return toBackupRecord(fileName, absolutePath);
    },
  );

  ipcMain.handle(IPC_CHANNELS.APP_SELECT_DIRECTORY, async () => {
    const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!window || window.isDestroyed()) {
      return null;
    }
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_EXPORT_TO_PATH,
    async (_event, payload: { fileName: string; targetPath: string }): Promise<boolean> => {
      const backupDir = getBackupDirectoryPath();
      const sourcePath = join(backupDir, payload.fileName);
      if (payload.fileName.includes('..') || payload.fileName.includes('/') || payload.fileName.includes('\\')) {
        throw new Error('Gecersiz yedek dosyasi.');
      }
      if (!existsSync(sourcePath)) {
        throw new Error('Yedek dosyasi bulunamadi.');
      }
      const targetFilePath = join(payload.targetPath, payload.fileName);
      copyFileSync(sourcePath, targetFilePath);
      return true;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DB_RETRY_QUEUE_RECORD,
    async (_event, payload: { entity: string; id: string }) =>
      getDatabaseService().retryQueueRecord(payload.entity, payload.id),
  );

  ipcMain.handle(
    IPC_CHANNELS.DB_DELETE_QUEUE_RECORD,
    async (_event, payload: { entity: string; id: string }) =>
      getDatabaseService().deleteQueueRecord(payload.entity, payload.id),
  );

  ipcMain.handle(IPC_CHANNELS.HARDWARE_GET_CONFIG, async () =>
    getDatabaseService().getHardwareConfig(),
  );

  ipcMain.handle(
    IPC_CHANNELS.HARDWARE_SET_CONFIG,
    async (_event, payload: HardwareConfig) => {
      getDatabaseService().setHardwareConfig(payload);
    },
  );

  ipcMain.handle(IPC_CHANNELS.HARDWARE_TEST_PRINT, async () => {
    const db = getDatabaseService();
    const config = db.getHardwareConfig();
    const testPayload = {
      copyCount: 1,
      lines: buildHardwareTestReceiptLines(config),
    };
    db.saveLastReceiptPayload(testPayload);
    return printerService.printReceipt(testPayload);
  });

  ipcMain.handle(IPC_CHANNELS.HARDWARE_PRINT_BARCODE, async (_event, payload) => {
    return printerService.printBarcode(payload);
  });

  ipcMain.handle(IPC_CHANNELS.HARDWARE_TEST_DRAWER, async () =>
    cashDrawerService.openDrawer({ reason: 'hardware-test' }),
  );

  ipcMain.handle(IPC_CHANNELS.HARDWARE_REPRINT_LAST_RECEIPT, async () => {
    const payload = getDatabaseService().getLastReceiptPayload();
    if (!payload) {
      return {
        errorCode: 'NO_LAST_RECEIPT',
        message: 'Yeniden yazdirma icin kayitli fis bulunamadi.',
        operatorAction: 'RETRY_PRINT',
        printedAt: new Date().toISOString(),
        success: false,
      };
    }
    return printerService.printReceipt(payload);
  });

  ipcMain.handle(
    IPC_CHANNELS.AUTH_CACHE_ONLINE_LOGIN,
    async (_event, payload: CacheLoginPayload) => {
      getDatabaseService().cacheOnlineLogin(payload);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_UPDATE_TOKENS,
    async (_event, payload: UpdateAuthTokensPayload) => {
      getDatabaseService().updateCachedAuthTokens(payload);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_OFFLINE_LOGIN,
    async (_event, payload: OfflineLoginPayload) =>
      getDatabaseService().offlineLogin(
        payload.username,
        payload.password,
        payload.companyId,
      ),
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_VERIFY_MANAGER_UNLOCK,
    async (_event, payload: ManagerUnlockPayload) =>
      getDatabaseService().verifyManagerUnlock(payload),
  );

  ipcMain.handle(
    IPC_CHANNELS.SECURITY_REQUEST_MANAGER_SMS,
    async (_event, payload: { username: string }) =>
      getSecurityService().requestManagerSmsCode(payload.username),
  );

  ipcMain.handle(
    IPC_CHANNELS.SECURITY_VERIFY_MANAGER_SMS,
    async (_event, payload: { code: string; username: string }) =>
      getSecurityService().verifyManagerSmsCode(payload.username, payload.code),
  );

  ipcMain.handle(
    IPC_CHANNELS.EINVOICE_CREATE,
    async (_event, payload: any) => getEInvoiceService().createInvoice(payload),
  );

  ipcMain.handle(
    IPC_CHANNELS.EINVOICE_GET_STATUS,
    async (_event, externalId: string) => getEInvoiceService().getInvoiceStatus(externalId),
  );

  ipcMain.handle(
    IPC_CHANNELS.YNOKC_PROCESS_PAYMENT,
    async (_event, payload: any) => getYNOKCManager().processPayment(payload),
  );

  ipcMain.handle(
    IPC_CHANNELS.YNOKC_CONFIGURE,
    async (_event, config: any) => getYNOKCManager().configure(config),
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_SET_MANAGER_PIN,
    async (_event, payload: { pin: string }) => {
      getDatabaseService().setManagerPin(payload.pin);
    },
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_CACHED_SESSION, async () =>
    getDatabaseService().getCachedSession(),
  );

  ipcMain.handle(IPC_CHANNELS.SETUP_GET_STATE, async () =>
    getDatabaseService().getSetupState(),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETUP_UPDATE_STEP,
    async (_event, payload: SetupStepUpdatePayload) =>
      getDatabaseService().updateSetupStep(payload),
  );

  ipcMain.handle(IPC_CHANNELS.SETUP_COMPLETE, async (_event, message?: string) =>
    getDatabaseService().completeSetup(message),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETUP_SET_OFFLINE_READINESS,
    async (_event, passed: boolean) =>
      getDatabaseService().setOfflineReadinessPassed(passed),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETUP_INCREMENT_OPERATOR_INTERVENTION,
    async () => getDatabaseService().incrementSetupOperatorIntervention(),
  );

  ipcMain.handle(
    IPC_CHANNELS.SETUP_MARK_FIRST_SALE,
    async (_event, atIso?: string) => getDatabaseService().markFirstSaleAt(atIso),
  );

  ipcMain.handle(IPC_CHANNELS.SETUP_RESET, async (_event, message?: string) =>
    getDatabaseService().resetSetup(message),
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_CLEAR_SESSION, async () => {
    getDatabaseService().clearCachedSession();
  });

  ipcMain.handle(
    IPC_CHANNELS.DB_CACHE_SYNC_DATA,
    async (_event, payload: UpsertSyncDataPayload) => {
      getDatabaseService().upsertSyncData(payload);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DB_GET_PRODUCTS,
    async (_event, options: ListCachedProductsOptions) =>
      getDatabaseService().listCachedProducts(options),
  );

  ipcMain.handle(IPC_CHANNELS.DB_GET_CATEGORIES, async (_event, companyId: string) =>
    getDatabaseService().listCachedCategories(companyId),
  );

  ipcMain.handle(IPC_CHANNELS.DB_GET_SUPPLIERS, async (_event, companyId: string) =>
    getDatabaseService().listCachedSuppliers(companyId),
  );

  ipcMain.handle(
    IPC_CHANNELS.DB_GET_PURCHASE_INVOICES,
    async (
      _event,
      params: {
        branchId: string;
        companyId: string;
        documentType?: 'DISPATCH' | 'INVOICE' | 'ORDER';
        limit?: number;
        page?: number;
        supplierId?: string;
      },
    ) => getDatabaseService().listCachedPurchaseInvoices(params),
  );


  ipcMain.handle(
    IPC_CHANNELS.DB_QUEUE_SALE,
    async (_event, payload: QueueSalePayload) =>
      getDatabaseService().queueSale(payload.sale, payload.localId),
  );

  ipcMain.handle(
    IPC_CHANNELS.DB_QUEUE_REFUND,
    async (_event, payload: QueueRefundPayload) =>
      getDatabaseService().queueRefund(payload.refund, payload.localId),
  );

  ipcMain.handle(
    IPC_CHANNELS.DB_QUEUE_PRODUCT_OP,
    async (_event, payload: QueueProductOpPayload) =>
      getDatabaseService().queueProductOp(payload.payload, payload.opType, payload.localId),
  );

  ipcMain.handle(
    IPC_CHANNELS.DB_QUEUE_STOCK_OP,
    async (_event, payload: QueueStockOpPayload) =>
      getDatabaseService().queueStockOp(payload.payload, payload.opType, payload.localId),
  );

  ipcMain.handle(IPC_CHANNELS.DB_LIST_PENDING_SALES, async (_event, limit?: number) =>
    getDatabaseService().listPendingSales(limit),
  );

  ipcMain.handle(IPC_CHANNELS.DB_LIST_PENDING_REFUNDS, async (_event, limit?: number) =>
    getDatabaseService().listPendingRefunds(limit),
  );

  ipcMain.handle(IPC_CHANNELS.DB_LIST_PENDING_CUSTOMER_OPS, async (_event, limit?: number) =>
    getDatabaseService().listPendingCustomerOps(limit),
  );

  ipcMain.handle(IPC_CHANNELS.DB_LIST_PENDING_PRODUCT_OPS, async (_event, limit?: number) =>
    getDatabaseService().listPendingProductOps(limit),
  );

  ipcMain.handle(IPC_CHANNELS.DB_LIST_PENDING_SUPPLIER_OPS, async (_event, limit?: number) =>
    getDatabaseService().listPendingSupplierOps(limit),
  );

  ipcMain.handle(IPC_CHANNELS.DB_LIST_PENDING_PURCHASE_OPS, async (_event, limit?: number) =>
    getDatabaseService().listPendingPurchaseOps(limit),
  );

  ipcMain.handle(IPC_CHANNELS.DB_LIST_PENDING_STOCK_OPS, async (_event, limit?: number) =>
    getDatabaseService().listPendingStockOps(limit),
  );

  ipcMain.handle(
    IPC_CHANNELS.REPORTS_GET_LOCAL_DAILY,
    async (_event, query: { companyId: string; limit?: number; referenceAt?: string; registerId: string }) =>
      getDatabaseService().getLocalDailyReport(query),
  );

  ipcMain.handle(IPC_CHANNELS.DB_GET_CUSTOMERS, async (_event, companyId: string, search?: string) =>
    getDatabaseService().getCachedCustomers(companyId, search),
  );
  
  ipcMain.handle(IPC_CHANNELS.DB_GET_BUNDLES, async (_event, companyId: string) =>
    getDatabaseService().listCachedBundles(companyId),
  );

  ipcMain.handle(IPC_CHANNELS.DB_QUEUE_CUSTOMER_OP, async (_event, payload: any) =>
    getDatabaseService().queueCustomerOp(payload),
  );

  ipcMain.handle(IPC_CHANNELS.APP_GET_LOCAL_SETTING, async (_event, key: string, defaultValue?: string) =>
    getDatabaseService().getLocalSetting(key, defaultValue),
  );

  ipcMain.handle(IPC_CHANNELS.APP_SET_LOCAL_SETTING, async (_event, key: string, value: string) =>
    getDatabaseService().setLocalSetting(key, value),
  );

  ipcMain.handle(IPC_CHANNELS.DB_QUEUE_STATUS, async () =>
    getDatabaseService().getSyncStatusSummary(),
  );

  ipcMain.handle(
    IPC_CHANNELS.SECURITY_LOG_EVENT,
    async (_event, payload: LogSecurityEventPayload) =>
      getDatabaseService().logSecurityEvent(payload),
  );

  ipcMain.handle(IPC_CHANNELS.SECURITY_LIST_EVENTS, async (_event, limit?: number) =>
    getDatabaseService().listSecurityEvents(limit ?? 100),
  );

  ipcMain.handle(
    IPC_CHANNELS.OPS_RECORD_SHIFT_HANDOVER,
    async (_event, payload: RecordShiftHandoverPayload) =>
      getDatabaseService().recordShiftHandover(payload),
  );

  ipcMain.handle(
    IPC_CHANNELS.OPS_LIST_SHIFT_HANDOVERS,
    async (_event, query?: ListOpsQuery) =>
      getDatabaseService().listShiftHandovers(query?.registerId, query?.limit ?? 100),
  );

  ipcMain.handle(
    IPC_CHANNELS.OPS_RECORD_CASH_MOVEMENT,
    async (_event, payload: RecordCashMovementPayload) =>
      getDatabaseService().recordCashMovement(payload),
  );

  ipcMain.handle(
    IPC_CHANNELS.OPS_LIST_CASH_MOVEMENTS,
    async (_event, query?: ListOpsQuery) =>
      getDatabaseService().listCashMovements(query?.registerId, query?.limit ?? 100),
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_RUN,
    async (_event, options?: SyncRunOptions): Promise<SyncRunResult> => {
      if (!options?.registerId) {
        throw new Error('registerId sync icin zorunludur');
      }
      let usedCursor: string | null = null;
      try {
        const db = getDatabaseService();
        const sync = getSyncService();
        if (options.accessToken) {
          sync.setAccessToken(options.accessToken);
        }

        const pendingSales = db.listPendingSales(options.maxPushItems ?? 200);
        const pendingRefunds = db.listPendingRefunds(options.maxPushItems ?? 200);
        const pendingCustomerOps = db.listPendingCustomerOps(options.maxPushItems ?? 200);
        const pendingProductOps = db.listPendingProductOps(options.maxPushItems ?? 200);
        const pendingSupplierOps = db.listPendingSupplierOps(options.maxPushItems ?? 200);
        const pendingPurchaseOps = db.listPendingPurchaseOps(options.maxPushItems ?? 200);
        const pendingStockOps = db.listPendingStockOps(options.maxPushItems ?? 200);
        usedCursor = db.getLastSyncCursor();

        const result = await sync.runFullSync({
          lastSyncAt: db.getLastSyncAt(),
          lastSyncCursor: usedCursor,
          pendingCustomerOps,
          pendingProductOps,
          pendingPurchaseOps,
          pendingRefunds,
          pendingSales,
          pendingSupplierOps,
          pendingStockOps,
          registerId: options.registerId,
          sessionId: options.sessionId,
        });

        if (result.pushedSaleIds.length > 0) {
          db.markSalesSynced(result.pushedSaleIds);
        }
        if (result.pushedRefundIds.length > 0) {
          db.markRefundsSynced(result.pushedRefundIds);
        }
        if (result.pushedCustomerOpIds.length > 0) {
          db.markCustomerOpsSynced(result.pushedCustomerOpIds);
        }
        if (result.pushedProductOpIds.length > 0) {
          db.markProductOpsSynced(result.pushedProductOpIds);
        }
        if (result.pushedSupplierOpIds.length > 0) {
          const updated = db.markSupplierOpsSynced(result.pushedSupplierOpIds);
          if (updated === 0) {
            db.markProductOpsSynced(result.pushedSupplierOpIds);
          }
        }
        if (result.pushedPurchaseOpIds.length > 0) {
          const updated = db.markPurchaseOpsSynced(result.pushedPurchaseOpIds);
          if (updated === 0) {
            db.markProductOpsSynced(result.pushedPurchaseOpIds);
          }
        }
        if (result.pushedStockOpIds.length > 0) {
          db.markStockOpsSynced(result.pushedStockOpIds);
        }

        for (const failedSaleId of result.failedSaleIds) {
          const failedRow = result.resultsByEntity.sales.find((row) => row.localId === failedSaleId);
          db.markSaleFailed(
            failedSaleId,
            failedRow?.error ?? result.pushSummary.errors.find((msg) => msg.includes(failedSaleId)) ?? 'Cloud push sale failed',
          );
        }

        for (const failedRefundId of result.failedRefundIds) {
          const failedRow = result.resultsByEntity.refunds.find((row) => row.localId === failedRefundId);
          db.markRefundFailed(
            failedRefundId,
            failedRow?.error ?? result.pushSummary.errors.find((msg) => msg.includes(failedRefundId)) ?? 'Cloud push refund failed',
          );
        }

        for (const failedCustomerOpId of result.failedCustomerOpIds) {
          const failedRow = result.resultsByEntity.customerOps.find((row) => row.localId === failedCustomerOpId);
          db.markCustomerOpFailed(
            failedCustomerOpId,
            failedRow?.error ?? result.pushSummary.errors.find((msg) => msg.includes(failedCustomerOpId)) ?? 'Cloud push customer op failed',
          );
        }

        for (const failedProductOpId of result.failedProductOpIds) {
          const failedRow =
            result.resultsByEntity.productOps.find((row) => row.localId === failedProductOpId);
          db.markProductOpFailed(
            failedProductOpId,
            failedRow?.error ?? result.pushSummary.errors.find((msg) => msg.includes(failedProductOpId)) ?? 'Cloud push product op failed',
          );
        }

        for (const failedSupplierOpId of result.failedSupplierOpIds) {
          const failedRow = result.resultsByEntity.supplierOps.find((row) => row.localId === failedSupplierOpId);
          const message =
            failedRow?.error ??
            result.pushSummary.errors.find((msg) => msg.includes(failedSupplierOpId)) ??
            'Cloud push supplier op failed';
          const updated = db.markSupplierOpFailed(failedSupplierOpId, message);
          if (updated === 0) {
            db.markProductOpFailed(failedSupplierOpId, message);
          }
        }

        for (const failedPurchaseOpId of result.failedPurchaseOpIds) {
          const failedRow = result.resultsByEntity.purchaseOps.find((row) => row.localId === failedPurchaseOpId);
          const message =
            failedRow?.error ??
            result.pushSummary.errors.find((msg) => msg.includes(failedPurchaseOpId)) ??
            'Cloud push purchase op failed';
          const updated = db.markPurchaseOpFailed(failedPurchaseOpId, message);
          if (updated === 0) {
            db.markProductOpFailed(failedPurchaseOpId, message);
          }
        }

        for (const failedStockOpId of result.failedStockOpIds) {
          const failedRow = result.resultsByEntity.stockOps.find((row) => row.localId === failedStockOpId);
          db.markStockOpFailed(
            failedStockOpId,
            failedRow?.error ?? result.pushSummary.errors.find((msg) => msg.includes(failedStockOpId)) ?? 'Cloud push stock op failed',
          );
        }

        db.upsertSyncData({
          categories: result.pulledCategories,
          products: result.pulledProducts,
          suppliers: result.pulledSuppliers,
          purchaseInvoices: [],
          users: result.pulledUsers,
          customers: [],
          bundles: [],
        });
        const cachedSession = db.getCachedSession();
        const scopedCompanyId =
          cachedSession?.user.companyId ??
          result.pulledProducts[0]?.companyId ??
          result.pulledCategories[0]?.companyId ??
          null;
        if (
          scopedCompanyId &&
          typeof result.remoteProductsTotalActive === 'number' &&
          result.remoteProductsTotalActive > 0
        ) {
          const localActiveCount = db.countActiveCachedProducts(scopedCompanyId);
          if (localActiveCount < result.remoteProductsTotalActive) {
            db.resetSyncCheckpoint();
            const fullPull = await sync.pullFullSnapshot(options.registerId);
            if (fullPull.errors.length === 0) {
              db.upsertSyncData({
                categories: fullPull.categories,
                products: fullPull.products,
                suppliers: fullPull.suppliers,
                purchaseInvoices: [],
                users: fullPull.users,
                customers: [],
                bundles: [],
              });
              result.nextCursor = fullPull.nextCursor;
              result.syncedAt = fullPull.serverSyncAt ?? result.syncedAt;
              result.remoteProductsTotalActive =
                fullPull.productsTotalActive ?? result.remoteProductsTotalActive;
              db.logSecurityEvent({
                eventType: 'SYNC_FULL_RECONCILIATION_APPLIED',
                message:
                  'Eksik urun algilandi, tam katalog senkronizasyonu otomatik uygulandi.',
                metadataJson: JSON.stringify({
                  localActiveCount,
                  remoteProductsTotalActive: result.remoteProductsTotalActive,
                }),
                severity: 'WARN',
              });
            } else {
              db.logSecurityEvent({
                eventType: 'SYNC_FULL_RECONCILIATION_FAILED',
                message:
                  'Eksik urun algilandi ancak tam katalog senkronizasyonu basarisiz oldu.',
                metadataJson: JSON.stringify({
                  errors: fullPull.errors,
                  localActiveCount,
                  remoteProductsTotalActive: result.remoteProductsTotalActive,
                }),
                severity: 'WARN',
              });
            }
          }
        }

        if (result.nextCursor || result.errors.length === 0) {
          db.setLastSyncAt(result.syncedAt);
        }
        if (result.nextCursor) {
          db.setLastSyncCursor(result.nextCursor);
        }
        const failedErrorCode =
          [
            ...result.resultsByEntity.customerOps,
            ...result.resultsByEntity.sales,
            ...result.resultsByEntity.refunds,
            ...result.resultsByEntity.productOps,
            ...result.resultsByEntity.supplierOps,
            ...result.resultsByEntity.purchaseOps,
            ...result.resultsByEntity.stockOps,
          ].find((row) => row.status === 'FAILED' && typeof row.errorCode === 'string')
            ?.errorCode ??
          (result.errors.length > 0 ? 'SYNC_RUN_FAILED' : null);
        db.setLastSyncErrorCode(failedErrorCode);
        void sendSyncHeartbeatBestEffort({
          accessToken: options.accessToken,
          registerId: options.registerId,
        });

        return result;
      } catch (error: unknown) {
        if (!isSqliteCorruptionError(error)) {
          throw error;
        }
        const recovery = attemptSqliteRecovery('SYNC_RUN');
        const resultMessage = recovery.recovered
          ? `SQLite bozulmasi algilandi. ${recovery.message} Senkronizasyonu tekrar baslatin.`
          : `SQLite bozulmasi algilandi ancak otomatik onarim basarisiz oldu: ${recovery.message}`;
        return buildSyncFailureResult(resultMessage, usedCursor);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PRINTER_PRINT_RECEIPT,
    async (_event, payload: ReceiptPrintPayload) => {
      getDatabaseService().saveLastReceiptPayload(payload);
      return printerService.printReceipt(payload);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CASH_DRAWER_OPEN,
    async (_event, options?: CashDrawerOpenOptions) =>
      cashDrawerService.openDrawer(options),
  );
}

function bootstrap(): void {
  app.whenReady().then(() => {
    registerIpcHandlers();

    // Start automation service
    getAutomationService().start();

    mainWindow = createMainWindow();
    refreshAutoBackupScheduler(true);
    configureAutoUpdate();
    configureSyncHeartbeatScheduler();
    void sendSyncHeartbeatBestEffort();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    clearAutoBackupTimer();
    clearAutoUpdateTimer();
    clearSyncHeartbeatTimer();
    autoUpdateConfigured = false;
    if (databaseService) {
      databaseService.close();
      databaseService = null;
    }
    syncService = null;
  });
}

bootstrap();
