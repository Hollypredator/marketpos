import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type ElectronApi } from './ipc';

const electronApi: ElectronApi = {
  ensureInteractive: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.APP_ENSURE_INTERACTIVE);
  },
  getBackofficeSettings: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKOFFICE_GET_SETTINGS),
  setBackofficeSettings: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKOFFICE_SET_SETTINGS, payload),
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
  updateCachedAuthTokens: async (payload) => {
    await ipcRenderer.invoke(IPC_CHANNELS.AUTH_UPDATE_TOKENS, payload);
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
  getCachedSuppliers: async (companyId) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_SUPPLIERS, companyId),
  getCachedPurchaseInvoices: async (params) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_PURCHASE_INVOICES, params),
  getCachedCustomers: async (companyId, search) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_CUSTOMERS, companyId, search),
  listCachedBundles: async (companyId) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_GET_BUNDLES, companyId),

  getLocalSetting: async (key, defaultValue) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_GET_LOCAL_SETTING, key, defaultValue),
  setLocalSetting: async (key, value) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_SET_LOCAL_SETTING, key, value),

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
  listPendingCustomerOps: async (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_PENDING_CUSTOMER_OPS, limit),
  listPendingProductOps: async (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_PENDING_PRODUCT_OPS, limit),
  listPendingPurchaseOps: async (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_PENDING_PURCHASE_OPS, limit),
  listPendingStockOps: async (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_PENDING_STOCK_OPS, limit),
  listPendingSupplierOps: async (limit) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_PENDING_SUPPLIER_OPS, limit),
  getLocalDailyReport: async (query) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GET_LOCAL_DAILY, query),
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
  printBarcode: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_PRINT_BARCODE, payload),
  queueRefund: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUEUE_REFUND, payload),
  queueSale: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUEUE_SALE, payload),
  queueProductOp: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUEUE_PRODUCT_OP, payload),
  queueStockOp: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUEUE_STOCK_OP, payload),
  queueCustomerOp: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_QUEUE_CUSTOMER_OP, payload),
  reprintLastReceipt: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_REPRINT_LAST_RECEIPT),
  runSync: async (options) => ipcRenderer.invoke(IPC_CHANNELS.SYNC_RUN, options),
  setHardwareConfig: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.HARDWARE_SET_CONFIG, payload),
  completeSetup: async (message) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETUP_COMPLETE, message),
  incrementSetupOperatorIntervention: async () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETUP_INCREMENT_OPERATOR_INTERVENTION),
  markFirstSale: async (atIso) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETUP_MARK_FIRST_SALE, atIso),
  resetSetup: async (message) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETUP_RESET, message),
  setOfflineReadinessPassed: async (passed) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETUP_SET_OFFLINE_READINESS, passed),
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
  requestManagerSmsCode: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.SECURITY_REQUEST_MANAGER_SMS, payload),
  verifyManagerSmsCode: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.SECURITY_VERIFY_MANAGER_SMS, payload),
  createEInvoice: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.EINVOICE_CREATE, payload),
  getEInvoiceStatus: async (externalId) =>
    ipcRenderer.invoke(IPC_CHANNELS.EINVOICE_GET_STATUS, externalId),
  processYNOKCPayment: async (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.YNOKC_PROCESS_PAYMENT, payload),
  configureYNOKC: async (config) =>
    ipcRenderer.invoke(IPC_CHANNELS.YNOKC_CONFIGURE, config),
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);
