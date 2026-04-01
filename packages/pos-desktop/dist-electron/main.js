"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const electron_1 = require("electron");
const ipc_1 = require("./ipc");
const cash_drawer_1 = require("./services/cash-drawer");
const database_1 = require("./services/database");
const printer_1 = require("./services/printer");
const sync_1 = require("./services/sync");
const DEFAULT_API_BASE_URL = process.env.MARKETPOS_API_BASE_URL ?? 'http://localhost:3001';
const DEFAULT_RENDERER_URL = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5173';
const IS_DEV = !electron_1.app.isPackaged;
let databaseService = null;
let mainWindow = null;
let syncService = null;
let autoBackupTimer = null;
let autoBackupInFlight = false;
let nextAutoBackupAt = null;
const cashDrawerService = new cash_drawer_1.CashDrawerService({
    getHardwareConfig: () => getDatabaseService().getHardwareConfig(),
});
const printerService = new printer_1.PrinterService({
    getHardwareConfig: () => getDatabaseService().getHardwareConfig(),
});
function getDatabaseService() {
    if (databaseService) {
        return databaseService;
    }
    const databasePath = (0, node_path_1.join)(electron_1.app.getPath('userData'), 'marketpos.db.sqlite');
    databaseService = new database_1.LocalDatabaseService(databasePath);
    return databaseService;
}
function getSyncService() {
    if (syncService) {
        return syncService;
    }
    syncService = new sync_1.SyncService({
        apiBaseUrl: DEFAULT_API_BASE_URL,
    });
    return syncService;
}
function getBackupDirectoryPath() {
    const backupDir = (0, node_path_1.join)(electron_1.app.getPath('userData'), 'backups');
    (0, node_fs_1.mkdirSync)(backupDir, { recursive: true });
    return backupDir;
}
function createBackupFileName() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `marketpos-backup-${stamp}.sqlite`;
}
function toBackupRecord(fileName, absolutePath) {
    const stat = (0, node_fs_1.statSync)(absolutePath);
    return {
        createdAt: stat.mtime.toISOString(),
        fileName,
        path: absolutePath,
        sizeBytes: stat.size,
    };
}
function listBackupRecords() {
    const backupDir = getBackupDirectoryPath();
    const files = (0, node_fs_1.readdirSync)(backupDir)
        .filter((name) => name.endsWith('.sqlite'))
        .map((fileName) => {
        const absolutePath = (0, node_path_1.join)(backupDir, fileName);
        return toBackupRecord(fileName, absolutePath);
    })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return files;
}
function asBackupPolicyState(policy) {
    return {
        ...policy,
        nextRunAt: policy.enabled ? nextAutoBackupAt : null,
    };
}
function clearAutoBackupTimer() {
    if (autoBackupTimer) {
        clearInterval(autoBackupTimer);
        autoBackupTimer = null;
    }
    nextAutoBackupAt = null;
}
function computeNextAutoBackupAt(intervalHours) {
    return new Date(Date.now() + intervalHours * 60 * 60 * 1000).toISOString();
}
function enforceBackupRetention(policy) {
    const backupDir = getBackupDirectoryPath();
    const backupDirLower = backupDir.toLowerCase();
    const backups = listBackupRecords();
    const nowMs = Date.now();
    const ageCutoffMs = nowMs - policy.retentionDays * 24 * 60 * 60 * 1000;
    const removeTargets = new Set();
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
        (0, node_fs_1.rmSync)(targetPath, { force: true });
    }
}
async function createLocalBackup(params) {
    const db = getDatabaseService();
    const backupDir = getBackupDirectoryPath();
    const fileName = createBackupFileName();
    const absolutePath = (0, node_path_1.join)(backupDir, fileName);
    await db.createBackup(absolutePath);
    db.markBackupPolicyRun();
    const policy = db.getBackupPolicy();
    enforceBackupRetention(policy);
    const eventType = params.trigger === 'MANUAL' ? 'BACKUP_CREATED' : 'BACKUP_AUTO_CREATED';
    const message = params.trigger === 'MANUAL'
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
async function runScheduledAutoBackup(trigger) {
    if (autoBackupInFlight) {
        return;
    }
    autoBackupInFlight = true;
    try {
        await createLocalBackup({ trigger });
    }
    catch (error) {
        const db = getDatabaseService();
        db.logSecurityEvent({
            eventType: 'BACKUP_AUTO_FAILED',
            message: `Otomatik yedekleme basarisiz: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
            metadataJson: JSON.stringify({ trigger }),
            severity: 'WARN',
        });
    }
    finally {
        autoBackupInFlight = false;
        refreshAutoBackupScheduler(false);
    }
}
function shouldRunStartupAutoBackup(policy) {
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
function refreshAutoBackupScheduler(runStartupCheck) {
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
function createMainWindow() {
    const window = new electron_1.BrowserWindow({
        backgroundColor: '#0F172A',
        height: 900,
        minHeight: 700,
        minWidth: 1100,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: (0, node_path_1.join)(__dirname, 'preload.js'),
            sandbox: false,
            webSecurity: true,
        },
        width: 1400,
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
        void electron_1.shell.openExternal(url);
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
    }
    else {
        void window.loadFile((0, node_path_1.join)(__dirname, '../dist/index.html'));
    }
    return window;
}
function buildHardwareTestReceiptLines(config) {
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
function registerIpcHandlers() {
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.APP_ENSURE_INTERACTIVE, async () => {
        const window = electron_1.BrowserWindow.getFocusedWindow() ?? mainWindow;
        if (!window || window.isDestroyed()) {
            return;
        }
        window.setIgnoreMouseEvents(false);
        window.setFocusable(true);
        window.focus();
        window.webContents.focus();
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.APP_RUNTIME_INFO, async () => ({
        apiBaseUrl: DEFAULT_API_BASE_URL,
        databasePath: getDatabaseService().getDatabasePath(),
        isPackaged: electron_1.app.isPackaged,
        platform: process.platform,
        userDataPath: electron_1.app.getPath('userData'),
        version: electron_1.app.getVersion(),
    }));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.APP_GET_UI_PRESET, async () => ({
        touchDensity: getDatabaseService().getTouchDensity(),
        uiPreset: getDatabaseService().getUiPreset(),
    }));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.APP_SET_UI_PRESET, async (_event, payload) => {
        getDatabaseService().setUiPreset(payload.uiPreset);
        if (payload.touchDensity) {
            getDatabaseService().setTouchDensity(payload.touchDensity);
        }
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.BACKUP_LIST, async () => listBackupRecords());
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.BACKUP_CREATE, async () => {
        const backup = await createLocalBackup({ trigger: 'MANUAL' });
        refreshAutoBackupScheduler(false);
        return backup;
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.BACKUP_GET_POLICY, async () => asBackupPolicyState(getDatabaseService().getBackupPolicy()));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.BACKUP_SET_POLICY, async (_event, payload) => {
        const db = getDatabaseService();
        const normalized = db.setBackupPolicy(payload);
        refreshAutoBackupScheduler(false);
        return asBackupPolicyState(normalized);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.BACKUP_RESTORE, async (_event, payload) => {
        const backupDir = getBackupDirectoryPath();
        const fileName = payload.fileName;
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            throw new Error('Gecersiz yedek dosyasi.');
        }
        const absolutePath = (0, node_path_1.join)(backupDir, fileName);
        if (!(0, node_fs_1.existsSync)(absolutePath)) {
            throw new Error('Secili yedek dosyasi bulunamadi.');
        }
        if (databaseService) {
            databaseService.close();
            databaseService = null;
        }
        const databasePath = (0, node_path_1.join)(electron_1.app.getPath('userData'), 'marketpos.db.sqlite');
        (0, node_fs_1.copyFileSync)(absolutePath, databasePath);
        (0, node_fs_1.rmSync)(`${databasePath}-wal`, { force: true });
        (0, node_fs_1.rmSync)(`${databasePath}-shm`, { force: true });
        const db = getDatabaseService();
        db.logSecurityEvent({
            eventType: 'BACKUP_RESTORED',
            message: `Lokal yedek geri yuklendi: ${fileName}`,
            metadataJson: JSON.stringify({ fileName, path: absolutePath }),
            severity: 'WARN',
        });
        return toBackupRecord(fileName, absolutePath);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.HARDWARE_GET_CONFIG, async () => getDatabaseService().getHardwareConfig());
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.HARDWARE_SET_CONFIG, async (_event, payload) => {
        getDatabaseService().setHardwareConfig(payload);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.HARDWARE_TEST_PRINT, async () => {
        const db = getDatabaseService();
        const config = db.getHardwareConfig();
        const testPayload = {
            copyCount: 1,
            lines: buildHardwareTestReceiptLines(config),
        };
        db.saveLastReceiptPayload(testPayload);
        return printerService.printReceipt(testPayload);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.HARDWARE_TEST_DRAWER, async () => cashDrawerService.openDrawer({ reason: 'hardware-test' }));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.HARDWARE_REPRINT_LAST_RECEIPT, async () => {
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
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.AUTH_CACHE_ONLINE_LOGIN, async (_event, payload) => {
        getDatabaseService().cacheOnlineLogin(payload);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.AUTH_OFFLINE_LOGIN, async (_event, payload) => getDatabaseService().offlineLogin(payload.username, payload.password, payload.companyId));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.AUTH_VERIFY_MANAGER_UNLOCK, async (_event, payload) => getDatabaseService().verifyManagerUnlock(payload));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.AUTH_SET_MANAGER_PIN, async (_event, payload) => {
        getDatabaseService().setManagerPin(payload.pin);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.AUTH_GET_CACHED_SESSION, async () => getDatabaseService().getCachedSession());
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.LICENSE_GET_ACCESS_SNAPSHOT, async (_event, companyId) => getDatabaseService().getCompanyAccessSnapshot(companyId));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.LICENSE_SET_ACCESS_SNAPSHOT, async (_event, snapshot) => {
        getDatabaseService().setCompanyAccessSnapshot(snapshot);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.SETUP_GET_STATE, async () => getDatabaseService().getSetupState());
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.SETUP_UPDATE_STEP, async (_event, payload) => getDatabaseService().updateSetupStep(payload));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.SETUP_COMPLETE, async (_event, message) => getDatabaseService().completeSetup(message));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.SETUP_RESET, async (_event, message) => getDatabaseService().resetSetup(message));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.AUTH_CLEAR_SESSION, async () => {
        getDatabaseService().clearCachedSession();
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.DB_CACHE_SYNC_DATA, async (_event, payload) => {
        getDatabaseService().upsertSyncData(payload);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.DB_GET_PRODUCTS, async (_event, options) => getDatabaseService().listCachedProducts(options));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.DB_GET_CATEGORIES, async (_event, companyId) => getDatabaseService().listCachedCategories(companyId));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.DB_QUEUE_SALE, async (_event, payload) => getDatabaseService().queueSale(payload.sale, payload.localId));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.DB_QUEUE_REFUND, async (_event, payload) => getDatabaseService().queueRefund(payload.refund, payload.localId));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.DB_LIST_PENDING_SALES, async (_event, limit) => getDatabaseService().listPendingSales(limit));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.DB_LIST_PENDING_REFUNDS, async (_event, limit) => getDatabaseService().listPendingRefunds(limit));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.DB_QUEUE_STATUS, async () => getDatabaseService().getQueueCounts());
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.SECURITY_LOG_EVENT, async (_event, payload) => getDatabaseService().logSecurityEvent(payload));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.SECURITY_LIST_EVENTS, async (_event, limit) => getDatabaseService().listSecurityEvents(limit ?? 100));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.OPS_RECORD_SHIFT_HANDOVER, async (_event, payload) => getDatabaseService().recordShiftHandover(payload));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.OPS_LIST_SHIFT_HANDOVERS, async (_event, query) => getDatabaseService().listShiftHandovers(query?.registerId, query?.limit ?? 100));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.OPS_RECORD_CASH_MOVEMENT, async (_event, payload) => getDatabaseService().recordCashMovement(payload));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.OPS_LIST_CASH_MOVEMENTS, async (_event, query) => getDatabaseService().listCashMovements(query?.registerId, query?.limit ?? 100));
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.SYNC_RUN, async (_event, options) => {
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
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.PRINTER_PRINT_RECEIPT, async (_event, payload) => {
        getDatabaseService().saveLastReceiptPayload(payload);
        return printerService.printReceipt(payload);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.CASH_DRAWER_OPEN, async (_event, options) => cashDrawerService.openDrawer(options));
}
function bootstrap() {
    electron_1.app.whenReady().then(() => {
        registerIpcHandlers();
        mainWindow = createMainWindow();
        refreshAutoBackupScheduler(true);
        electron_1.app.on('activate', () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createMainWindow();
            }
        });
    });
    electron_1.app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            electron_1.app.quit();
        }
    });
    electron_1.app.on('before-quit', () => {
        clearAutoBackupTimer();
        if (databaseService) {
            databaseService.close();
            databaseService = null;
        }
        syncService = null;
    });
}
bootstrap();
//# sourceMappingURL=main.js.map