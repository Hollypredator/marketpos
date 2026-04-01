"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const ipc_1 = require("./ipc");
const electronApi = {
    ensureInteractive: async () => {
        await electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.APP_ENSURE_INTERACTIVE);
    },
    createBackup: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.BACKUP_CREATE),
    getBackupPolicy: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.BACKUP_GET_POLICY),
    listBackups: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.BACKUP_LIST),
    restoreBackup: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.BACKUP_RESTORE, payload),
    setBackupPolicy: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.BACKUP_SET_POLICY, payload),
    cacheOnlineLogin: async (payload) => {
        await electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.AUTH_CACHE_ONLINE_LOGIN, payload);
    },
    cacheSyncData: async (payload) => {
        await electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.DB_CACHE_SYNC_DATA, payload);
    },
    clearSession: async () => {
        await electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.AUTH_CLEAR_SESSION);
    },
    getCachedCategories: async (companyId) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.DB_GET_CATEGORIES, companyId),
    getCachedProducts: async (options) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.DB_GET_PRODUCTS, options),
    getCompanyAccessSnapshot: async (companyId) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.LICENSE_GET_ACCESS_SNAPSHOT, companyId),
    getCachedSession: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.AUTH_GET_CACHED_SESSION),
    getHardwareConfig: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.HARDWARE_GET_CONFIG),
    getQueueStatus: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.DB_QUEUE_STATUS),
    getRuntimeInfo: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.APP_RUNTIME_INFO),
    getSetupState: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.SETUP_GET_STATE),
    getUiPreset: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.APP_GET_UI_PRESET),
    listPendingRefunds: async (limit) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.DB_LIST_PENDING_REFUNDS, limit),
    listPendingSales: async (limit) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.DB_LIST_PENDING_SALES, limit),
    listSecurityEvents: async (limit) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.SECURITY_LIST_EVENTS, limit),
    listShiftHandovers: async (query) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.OPS_LIST_SHIFT_HANDOVERS, query),
    listCashMovements: async (query) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.OPS_LIST_CASH_MOVEMENTS, query),
    logSecurityEvent: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.SECURITY_LOG_EVENT, payload),
    recordShiftHandover: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.OPS_RECORD_SHIFT_HANDOVER, payload),
    recordCashMovement: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.OPS_RECORD_CASH_MOVEMENT, payload),
    offlineLogin: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.AUTH_OFFLINE_LOGIN, payload),
    openCashDrawer: async (options) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.CASH_DRAWER_OPEN, options),
    printReceipt: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.PRINTER_PRINT_RECEIPT, payload),
    queueRefund: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.DB_QUEUE_REFUND, payload),
    queueSale: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.DB_QUEUE_SALE, payload),
    reprintLastReceipt: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.HARDWARE_REPRINT_LAST_RECEIPT),
    runSync: async (options) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.SYNC_RUN, options),
    setHardwareConfig: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.HARDWARE_SET_CONFIG, payload),
    completeSetup: async (message) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.SETUP_COMPLETE, message),
    resetSetup: async (message) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.SETUP_RESET, message),
    setCompanyAccessSnapshot: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.LICENSE_SET_ACCESS_SNAPSHOT, payload),
    setManagerPin: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.AUTH_SET_MANAGER_PIN, payload),
    testHardwareDrawer: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.HARDWARE_TEST_DRAWER),
    testHardwarePrint: async () => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.HARDWARE_TEST_PRINT),
    updateSetupStep: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.SETUP_UPDATE_STEP, payload),
    setUiPreset: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.APP_SET_UI_PRESET, payload),
    verifyManagerUnlock: async (payload) => electron_1.ipcRenderer.invoke(ipc_1.IPC_CHANNELS.AUTH_VERIFY_MANAGER_UNLOCK, payload),
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronApi);
//# sourceMappingURL=preload.js.map