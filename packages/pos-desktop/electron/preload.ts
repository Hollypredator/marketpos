import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type ElectronApi } from './ipc';

const electronApi: ElectronApi = {
  ensureInteractive: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.APP_ENSURE_INTERACTIVE);
  },
  createBackup: async () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE),
  getBackupPolicy: async () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_GET_POLICY),
  listBackups: async () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIST),
  restoreBackup: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, payload),
  setBackupPolicy: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SET_POLICY, payload),
  cacheOnlineLogin: async (payload) => {
    await ipcRenderer.invoke(IPC_CHANNELS.AUTH_CACHE_ONLINE_LOGIN, payload);
  },
  cacheSyncData: async (payload) => {
    await ipcRenderer.invoke(IPC_CHANNELS.DB_CACHE_SYNC_DATA, payload);
  },
  clearSession: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.AUTH_CLEAR_SESSION);
  },
  getCachedCategories: async (companyId) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_CATEGORIES, companyId),
  getCachedProducts: async (options) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_PRODUCTS, options),
  getCompanyAccessSnapshot: async (companyId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LICENSE_GET_ACCESS_SNAPSHOT, companyId),
  getCachedSession: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_CACHED_SESSION),
  getHardwareConfig: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_GET_CONFIG),
  getQueueStatus: async () => ipcRenderer.invoke(IPC_CHANNELS.DB_QUEUE_STATUS),
  getRuntimeInfo: async () => ipcRenderer.invoke(IPC_CHANNELS.APP_RUNTIME_INFO),
  getSetupState: async () => ipcRenderer.invoke(IPC_CHANNELS.SETUP_GET_STATE),
  getUiPreset: async () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_UI_PRESET),
  listPendingRefunds: async (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_PENDING_REFUNDS, limit),
  listPendingSales: async (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_PENDING_SALES, limit),
  listSecurityEvents: async (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.SECURITY_LIST_EVENTS, limit),
  listShiftHandovers: async (query) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPS_LIST_SHIFT_HANDOVERS, query),
  listCashMovements: async (query) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPS_LIST_CASH_MOVEMENTS, query),
  logSecurityEvent: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.SECURITY_LOG_EVENT, payload),
  recordShiftHandover: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPS_RECORD_SHIFT_HANDOVER, payload),
  recordCashMovement: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPS_RECORD_CASH_MOVEMENT, payload),
  offlineLogin: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_OFFLINE_LOGIN, payload),
  openCashDrawer: async (options) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_DRAWER_OPEN, options),
  printReceipt: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRINTER_PRINT_RECEIPT, payload),
  queueRefund: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUEUE_REFUND, payload),
  queueSale: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUEUE_SALE, payload),
  reprintLastReceipt: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_REPRINT_LAST_RECEIPT),
  runSync: async (options) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_RUN, options),
  setHardwareConfig: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_SET_CONFIG, payload),
  completeSetup: async (message) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETUP_COMPLETE, message),
  resetSetup: async (message) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETUP_RESET, message),
  setCompanyAccessSnapshot: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.LICENSE_SET_ACCESS_SNAPSHOT, payload),
  setManagerPin: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_SET_MANAGER_PIN, payload),
  testHardwareDrawer: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_TEST_DRAWER),
  testHardwarePrint: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_TEST_PRINT),
  updateSetupStep: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETUP_UPDATE_STEP, payload),
  setUiPreset: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_SET_UI_PRESET, payload),
  verifyManagerUnlock: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_VERIFY_MANAGER_UNLOCK, payload),
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);
