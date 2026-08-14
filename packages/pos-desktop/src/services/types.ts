import type { PaymentMethod } from '@marketpos/shared';
import type {
  BackofficeSettings,
  BackupFileRecord,
  BackupPolicy,
  BackupPolicyState,
  CashMovementRecord,
  CashMovementType,
  CustomerOpQueueRecord,
  HardwareConfig,
  HardwareErrorCode,
  HardwareOperatorAction,
  LogSecurityEventPayload,
  ManagerUnlockMethod,
  ProductOpQueueRecord,
  PurchaseOpQueueRecord,
  RecordCashMovementPayload,
  RecordShiftHandoverPayload,
  SecurityEventRecord,
  ShiftHandoverRecord,
  StockOpQueueRecord,
  SupplierOpQueueRecord,
} from '../electron-api';

export interface AuthUser {
  branchId: string | null;
  companyId: string;
  fullName: string;
  id: string;
  role: string;
  username: string;
}

export interface AuthSession {
  accessToken: string | null;
  isOnline: boolean;
  refreshToken: string | null;
  registerId: string;
  sessionId: string;
  user: AuthUser;
}

export interface OfflineCredential {
  companyId?: string;
  password: string;
  username: string;
}

export interface PendingSaleItem {
  discount?: number;
  campaignDiscount?: number;
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface PendingSalePayment {
  amount: number;
  method: PaymentMethod;
  reference?: string;
}

export interface PendingSale {
  clientRequestId?: string;
  customerId?: string;
  items: PendingSaleItem[];
  localReceiptNumber?: string;
  note?: string;
  payments: PendingSalePayment[];
  registerId: string;
  sessionId: string;
  totalCartDiscount?: number;
}

export interface CustomerRecord {
  address: string | null;
  balance: number;
  companyId: string;
  email: string | null;
  fullName: string;
  id: string;
  isActive: boolean;
  name?: string;
  loyaltyPoints: number;
  phone: string | null;
  priceTier?: 'RETAIL' | 'WHOLESALE';
  taxNumber: string | null;
}

export interface PaginationMeta {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<TData> {
  data: TData[];
  pagination: PaginationMeta;
}

export interface SupplierRecord {
  address?: string | null;
  balance: number;
  companyId: string;
  createdAt?: string;
  email?: string | null;
  id: string;
  isActive: boolean;
  name: string;
  phone?: string | null;
  taxNumber?: string | null;
  updatedAt?: string;
}

export interface SupplierFormInput {
  address?: string;
  email?: string;
  name: string;
  phone?: string;
  taxNumber?: string;
}

export interface SupplierTransactionRecord {
  amount: number;
  createdAt: string;
  description?: string | null;
  id: string;
  invoice?: {
    documentType: 'DISPATCH' | 'INVOICE' | 'ORDER';
    id: string;
    invoiceNumber: string;
  } | null;
  invoiceId?: string | null;
  supplierId: string;
  type: 'DEBT' | 'PAYMENT';
}

export interface CreateSupplierTransactionInput {
  amount: number;
  description?: string;
  invoiceId?: string;
  type: 'DEBT' | 'PAYMENT';
}

export interface PurchaseInvoiceItemRecord {
  discount?: number;
  id: string;
  lineTotal: number;
  productId: string;
  quantity: number;
  unitPrice: number;
  vatAmount?: number;
}

export interface PurchaseInvoiceRecord {
  branchId: string;
  convertedAt?: string | null;
  convertedToInvoiceId?: string | null;
  createdAt?: string;
  dispatchNumber?: string | null;
  documentDate?: string | null;
  documentType: 'DISPATCH' | 'INVOICE' | 'ORDER';
  dueDate?: string | null;
  grandTotal: number;
  id: string;
  invoiceNumber: string;
  sourceDispatchId?: string | null;
  status: 'CANCELLED' | 'COMPLETED' | 'DRAFT';
  subtotal?: number;
  supplierId: string;
  supplierName?: string;
  totalDiscount?: number;
  totalVat?: number;
  updatedAt?: string;
  items?: PurchaseInvoiceItemRecord[];
}

export interface CreatePurchaseInvoiceInput {
  branchId: string;
  dispatchNumber?: string;
  documentDate?: string | null;
  documentType: 'DISPATCH' | 'INVOICE' | 'ORDER';
  dueDate?: string | null;
  invoiceNumber: string;
  items: Array<{
    discount: number;
    productId: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
  }>;
  note?: string;
  supplierId: string;
  totalDiscount: number;
}

export interface CreateCustomerInput {
  address?: string;
  email?: string;
  name: string;
  phone?: string;
  taxNumber?: string;
}

export interface PendingRefundItem {
  quantity: number;
  saleItemId: string;
}

export interface PendingRefund {
  clientRequestId?: string;
  items: PendingRefundItem[];
  reason?: string;
  registerId: string;
  reportItems?: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  saleId: string;
  sessionId: string;
  totalAmount?: number;
}

export interface SaleReceiptItem {
  id: string;
  lineTotal: number;
  productId: string;
  productName: string;
  quantity: number;
  saleId: string;
  unitPrice: number;
  vatAmount: number;
  vatRate: number;
}

export interface SaleReceiptPayment {
  amount: number;
  method: PaymentMethod;
}

export interface SaleReceipt {
  branch?: { name: string } | null;
  createdAt: string;
  grandTotal: number;
  id: string;
  items: SaleReceiptItem[];
  payments: SaleReceiptPayment[];
  receiptNumber: string;
  register?: { name: string } | null;
  status: string;
}

export interface DailyReport {
  date: string;
  netSales: number;
  paymentBreakdown: Array<{
    method: PaymentMethod;
    total: number;
  }>;
  refundsCount: number;
  salesCount: number;
  totalRefunds: number;
  totalSales: number;
  totalVat: number;
}

export interface TopProductReportRow {
  count: number;
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface StockLevelRow {
  branchId: string;
  id: string;
  product: {
    barcode: string;
    id: string;
    isActive: boolean;
    minStock: number;
    name: string;
    salePrice: number;
  };
  productId: string;
  quantity: number;
  updatedAt: string;
}

export interface CreateProductInput {
  barcode: string;
  brand?: string | null;
  categoryId?: string;
  clientRequestId?: string;
  companyId?: string;
  description?: string;
  expiryDate?: string | null;
  id?: string;
  isQuickAccess?: boolean;
  minStock: number;
  name: string;
  purchasePrice: number;
  quickAccessOrder?: number;
  salePrice: number;
  supplierId?: string | null;
  vatRate: number;
}

export interface UpdateProductInput {
  barcode?: string;
  brand?: string | null;
  categoryId?: string;
  clientRequestId?: string;
  companyId?: string;
  description?: string | null;
  expiryDate?: string | null;
  id?: string;
  isQuickAccess?: boolean;
  minStock?: number;
  name?: string;
  purchasePrice?: number;
  quickAccessOrder?: number;
  salePrice?: number;
  supplierId?: string | null;
  vatRate?: number;
}

export interface SyncState {
  errors: string[];
  isRunning: boolean;
  lastSyncAt: string | null;
  queueRefunds: number;
  queueSales: number;
}

export interface OfflineQueuedProductOperation {
  body: Record<string, unknown>;
  method: 'DELETE' | 'POST' | 'PUT';
  path: string;
}

export interface OfflineQueuedStockOperation {
  body: Record<string, unknown>;
}

export type UiPreset = 'cafe' | 'kasap' | 'market' | 'pide';
export type TouchDensity = 'compact' | 'comfortable';

export interface UiPresetDefinition {
  accentColor: string;
  description: string;
  id: UiPreset;
  label: string;
}

export interface ManagerUnlockState {
  method: ManagerUnlockMethod;
  requiresPinSetup: boolean;
  userFullName: string;
}

export interface HardwareStepResult {
  errorCode?: HardwareErrorCode;
  message: string;
  operatorAction: HardwareOperatorAction;
  success: boolean;
}

export interface SaleHardwareStepState {
  drawer?: HardwareStepResult;
  printer: HardwareStepResult;
}

export type {
  BackofficeSettings,
  BackupFileRecord,
  BackupPolicy,
  BackupPolicyState,
  CashMovementRecord,
  CashMovementType,
  LogSecurityEventPayload,
  RecordCashMovementPayload,
  RecordShiftHandoverPayload,
  SecurityEventRecord,
  ShiftHandoverRecord,
  CustomerOpQueueRecord,
  ProductOpQueueRecord,
  PurchaseOpQueueRecord,
  StockOpQueueRecord,
  SupplierOpQueueRecord,
};

export type { HardwareConfig };
