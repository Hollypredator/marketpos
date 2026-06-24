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
  brand?: string | null;
  campaign?: Record<string, unknown> | null;
  categoryId: string | null;
  companyId: string;
  description?: string | null;
  expiryDate?: string | null;
  id: string;
  isActive: boolean;
  isQuickAccess: boolean;
  name: string;
  purchasePrice: number;
  quickAccessColor: string | null;
  quickAccessOrder: number | null;
  salePrice: number;
  supplierId?: string | null;
  supplierName?: string | null;
  wholesalePrice?: number | null;
  vatRate: number;
  stockLevel: number;
  estimatedStock: number;
}

export interface CachedSupplierRecord {
  id: string;
  companyId: string;
  name: string;
  balance?: number;
  phone?: string | null;
  taxNumber?: string | null;
  isActive: boolean;
}

export interface CachedPurchaseInvoiceRecord {
  id: string;
  companyId: string;
  branchId: string;
  supplierId: string;
  createdAt?: string;
  updatedAt?: string;
  invoiceNumber: string;
  documentType?: 'ORDER' | 'DISPATCH' | 'INVOICE';
  dispatchNumber?: string | null;
  documentDate?: string | null;
  dueDate?: string | null;
  sourceDispatchId?: string | null;
  convertedToInvoiceId?: string | null;
  convertedAt?: string | null;
  subtotal?: number;
  totalVat?: number;
  totalDiscount?: number;
  grandTotal?: number;
  totalGrandTotal: number;
  status: string;
  invoiceDate: string;
}

export interface CachedPurchaseInvoiceItemRecord {
  id: string;
  purchaseInvoiceId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  vatAmount?: number;
  discount?: number;
  lineTotal: number;
}

export interface CachedBundleRecord {
  id: string;
  companyId: string;
  name: string;
  productIds: string[];
  bundlePrice: number;
  isActive: boolean;
  updatedAt: string;
}

export interface PendingSaleRecord {
  createdAt: string;
  id: string;
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface PendingRefundRecord {
  createdAt: string;
  id: string;
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface ProductOpQueueRecord {
  createdAt: string;
  id: string;
  opType: 'CREATE' | 'DELETE' | 'UPDATE';
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface CustomerOpQueueRecord {
  createdAt: string;
  id: string;
  opType: 'CREATE' | 'DELETE' | 'UPDATE';
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface SupplierOpQueueRecord {
  createdAt: string;
  id: string;
  opType: 'CREATE' | 'DELETE' | 'UPDATE';
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface PurchaseOpQueueRecord {
  createdAt: string;
  id: string;
  opType: 'CREATE' | 'DELETE' | 'UPDATE';
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export interface StockOpQueueRecord {
  createdAt: string;
  id: string;
  opType: 'MOVEMENT';
  payloadData: string;
  syncStatus: 'FAILED' | 'PENDING' | 'SYNCED';
  syncedAt: string | null;
  failureCount: number;
  syncError?: string | null;
}

export type SyncPushResultStatus = 'ACCEPTED' | 'FAILED' | 'REPLAYED';
export type SyncPushEntity =
  | 'customerOps'
  | 'productOps'
  | 'purchaseOps'
  | 'refunds'
  | 'sales'
  | 'stockOps'
  | 'supplierOps';

export interface SyncPushEntityResult {
  entity: SyncPushEntity;
  error?: string;
  errorCode?: string;
  localId: string;
  operationKey: string;
  status: SyncPushResultStatus;
}

export interface SyncPushResultsByEntity {
  customerOps: SyncPushEntityResult[];
  productOps: SyncPushEntityResult[];
  purchaseOps: SyncPushEntityResult[];
  refunds: SyncPushEntityResult[];
  sales: SyncPushEntityResult[];
  stockOps: SyncPushEntityResult[];
  supplierOps: SyncPushEntityResult[];
}

export interface SyncPushSummary {
  acceptedCount: number;
  errors: string[];
  failedCount: number;
  replayedCount: number;
  serverSyncAt: string;
}

export interface SyncRunResult {
  failedCustomerOpIds: string[];
  errors: string[];
  failedPurchaseOpIds: string[];
  failedProductOpIds: string[];
  failedRefundIds: string[];
  failedSaleIds: string[];
  failedSupplierOpIds: string[];
  failedStockOpIds: string[];
  nextCursor: string | null;
  pulledCategories: CachedCategoryRecord[];
  pulledProducts: CachedProductRecord[];
  pulledPurchaseInvoiceItems: number;
  pulledUsers: CachedUserRecord[];
  pulledSuppliers: CachedSupplierRecord[];
  pulledCustomers: number;
  pulledPurchaseInvoices: number;
  pulledBundles: number;
  pushedAccepted: number;
  pushedCustomerOpIds: string[];
  pushedCustomerOps: number;
  pushedFailed: number;
  pushedPurchaseOpIds: string[];
  pushedPurchaseOps: number;
  pushedRefundIds: string[];
  pushedRefunds: number;
  pushedProductOpIds: string[];
  pushedProductOps: number;
  pushedReplayed: number;
  pushedSaleIds: string[];
  pushedSales: number;
  pushedStockOpIds: string[];
  pushedStockOps: number;
  pushedSupplierOpIds: string[];
  pushedSupplierOps: number;
  pushSummary: SyncPushSummary;
  resultsByEntity: SyncPushResultsByEntity;
  remoteProductsTotalActive?: number | null;
  success: boolean;
  syncedAt: string;
  usedCursor: string | null;
}

export type SyncHealthStatus = 'DEGRADED' | 'IDLE' | 'OK';

export interface QueueEntityStatusSummary {
  failed: number;
  pending: number;
  queued: number;
  synced: number;
}

export interface SyncStatusSummary {
  customerOps: number;
  lastSyncErrorCode: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncHealthStatus;
  oldestPendingAgeSec: number | null;
  pendingCount: number;
  productOps: number;
  purchaseOps: number;
  queuePeak: number;
  refunds: number;
  sales: number;
  stockOps: number;
  supplierOps: number;
  queueByEntity: {
    customerOps: QueueEntityStatusSummary;
    productOps: QueueEntityStatusSummary;
    purchaseOps: QueueEntityStatusSummary;
    refunds: QueueEntityStatusSummary;
    sales: QueueEntityStatusSummary;
    stockOps: QueueEntityStatusSummary;
    supplierOps: QueueEntityStatusSummary;
  };
}
