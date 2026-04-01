import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import {
  IPC_CHANNELS,
  type BackupPolicy,
  type BackupPolicyState,
  type BackupRestorePayload,
  type CacheLoginPayload,
  type CompanyAccessSnapshot,
  type HardwareConfig,
  type ListOpsQuery,
  type LogSecurityEventPayload,
  type ManagerUnlockPayload,
  type ListCachedProductsOptions,
  type QueueRefundPayload,
  type QueueSalePayload,
  type RecordCashMovementPayload,
  type RecordShiftHandoverPayload,
  type RuntimeInfo,
  type SetupStepUpdatePayload,
  type UiPresetState,
} from './ipc';
import type { TouchDensity, UiPreset } from './services/database';
import type { CashDrawerOpenOptions } from './services/cash-drawer';
import { CashDrawerService } from './services/cash-drawer';
import { LocalDatabaseService, type UpsertSyncDataPayload } from './services/database';
import { PrinterService, type ReceiptPrintPayload } from './services/printer';
import { SyncService, type SyncRunOptions, type SyncRunResult } from './services/sync';

const DEFAULT_API_BASE_URL = process.env.MARKETPOS_API_BASE_URL ?? 'http://localhost:3001';
const DEFAULT_RENDERER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5173';
const IS_DEV = !app.isPackaged;

let databaseService: LocalDatabaseService | null = null;
let mainWindow: BrowserWindow | null = null;
let syncService: SyncService | null = null;
let autoBackupTimer: NodeJS.Timeout | null = null;
let autoBackupInFlight = false;
let nextAutoBackupAt: string | null = null;
const cashDrawerService = new CashDrawerService({
  getHardwareConfig: () => getDatabaseService().getHardwareConfig(),
});
const printerService = new PrinterService({
  getHardwareConfig: () => getDatabaseService().getHardwareConfig(),
});

interface OfflineLoginPayload {
  companyId?: string;
  password: string;
  username: string;
}

function getDatabaseService(): LocalDatabaseService {
  if (databaseService) {
    return databaseService;
  }
  const databasePath = join(app.getPath('userData'), 'marketpos.db.sqlite');
  databaseService = new LocalDatabaseService(databasePath);
  return databaseService;
}

function getSyncService(): SyncService {
  if (syncService) {
    return syncService;
  }
  syncService = new SyncService({
    apiBaseUrl: DEFAULT_API_BASE_URL,
  });
  return syncService;
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

  ipcMain.handle(IPC_CHANNELS.APP_RUNTIME_INFO, async (): Promise<RuntimeInfo> => ({
    apiBaseUrl: DEFAULT_API_BASE_URL,
    databasePath: getDatabaseService().getDatabasePath(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    version: app.getVersion(),
  }));

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
    IPC_CHANNELS.AUTH_SET_MANAGER_PIN,
    async (_event, payload: { pin: string }) => {
      getDatabaseService().setManagerPin(payload.pin);
    },
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_CACHED_SESSION, async () =>
    getDatabaseService().getCachedSession(),
  );

  ipcMain.handle(
    IPC_CHANNELS.LICENSE_GET_ACCESS_SNAPSHOT,
    async (_event, companyId: string) =>
      getDatabaseService().getCompanyAccessSnapshot(companyId),
  );

  ipcMain.handle(
    IPC_CHANNELS.LICENSE_SET_ACCESS_SNAPSHOT,
    async (_event, snapshot: CompanyAccessSnapshot) => {
      getDatabaseService().setCompanyAccessSnapshot(snapshot);
    },
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

  ipcMain.handle(IPC_CHANNELS.DB_LIST_PENDING_SALES, async (_event, limit?: number) =>
    getDatabaseService().listPendingSales(limit),
  );

  ipcMain.handle(IPC_CHANNELS.DB_LIST_PENDING_REFUNDS, async (_event, limit?: number) =>
    getDatabaseService().listPendingRefunds(limit),
  );

  ipcMain.handle(IPC_CHANNELS.DB_QUEUE_STATUS, async () =>
    getDatabaseService().getQueueCounts(),
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

      const db = getDatabaseService();
      const sync = getSyncService();
      if (options.accessToken) {
        sync.setAccessToken(options.accessToken);
      }

      const pendingSales = db.listPendingSales(options.maxPushItems ?? 200);
      const pendingRefunds = db.listPendingRefunds(options.maxPushItems ?? 200);

      const result = await sync.runFullSync({
        lastSyncAt: db.getLastSyncAt(),
        pendingRefunds,
        pendingSales,
        registerId: options.registerId,
      });

      if (result.pushedSaleIds.length > 0) {
        db.markSalesSynced(result.pushedSaleIds);
      }
      if (result.pushedRefundIds.length > 0) {
        db.markRefundsSynced(result.pushedRefundIds);
      }

      const failedSales = pendingSales
        .map((sale) => sale.id)
        .filter((saleId) => !result.pushedSaleIds.includes(saleId));
      for (const failedSaleId of failedSales) {
        db.markSaleFailed(failedSaleId, 'Cloud push sale failed');
      }

      const failedRefunds = pendingRefunds
        .map((refund) => refund.id)
        .filter((refundId) => !result.pushedRefundIds.includes(refundId));
      for (const failedRefundId of failedRefunds) {
        db.markRefundFailed(failedRefundId, 'Cloud push refund failed');
      }

      db.upsertSyncData({
        categories: result.pulledCategories,
        products: result.pulledProducts,
        users: result.pulledUsers,
      });

      if (result.success) {
        db.setLastSyncAt(result.syncedAt);
      }

      return result;
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
    mainWindow = createMainWindow();
    refreshAutoBackupScheduler(true);

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
    if (databaseService) {
      databaseService.close();
      databaseService = null;
    }
    syncService = null;
  });
}

bootstrap();
