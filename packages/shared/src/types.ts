import {
  UserRole,
  PaymentMethod,
  SaleStatus,
  StockMovementType,
  SyncStatus,
  RegisterSessionStatus,
  UnitType,
  VatRate,
} from './constants';

// ========================
// BASE
// ========================

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ========================
// FİRMA / ŞUBE / KASA
// ========================

export interface Company extends BaseEntity {
  name: string;
  taxNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  maxItemDiscountPercent?: number;
  maxCartDiscountPercent?: number;
  isActive: boolean;
  packageType?: 'MONTHLY' | 'YEARLY';
  packageStatus?: 'ACTIVE' | 'SUSPENDED';
  packageGraceDays?: number;
  packageStartedAt?: string | null;
  packageExpiresAt?: string | null;
  packageGraceEndsAt?: string | null;
}

export type LicenseStatus = 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'GRACE_PERIOD' | 'SUSPENDED';

export interface AnnualLicenseInfo {
  companyId: string;
  companyName: string;
  status: LicenseStatus;
  packageType: 'MONTHLY' | 'YEARLY';
  expiresAt: string;
  graceEndsAt: string;
  gracePeriodDays: number;
  lastVerifiedAt: string;
  offlineToken?: string;
  isExpired: boolean;
  inGracePeriod: boolean;
  daysRemaining: number;
}


export interface Branch extends BaseEntity {
  companyId: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
}

export interface Register extends BaseEntity {
  branchId: string;
  name: string;
  isActive: boolean;
}

// ========================
// KULLANICI
// ========================

export interface User extends BaseEntity {
  companyId: string;
  branchId?: string | null;
  email?: string | null;
  username: string;
  passwordHash?: string;
  pin?: string | null;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export interface UserPublic extends Omit<User, 'passwordHash' | 'pin'> {}

export interface Customer extends BaseEntity {
  companyId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  balance: number;
  priceTier?: 'RETAIL' | 'WHOLESALE';
  isActive: boolean;
}

export interface CustomerTransaction {
  id: string;
  customerId: string;
  type: 'DEBT' | 'PAYMENT';
  amount: number;
  description?: string | null;
  saleId?: string | null;
  createdAt: string;
}

// ========================
// KATEGORİ / ÜRÜN
// ========================

export interface Category extends BaseEntity {
  companyId: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  color?: string | null;
  icon?: string | null;
}

export type CampaignType = 'BUY_X_PAY_Y' | 'BUNDLE_FIXED_PRICE' | 'CATEGORY_PERCENT';

export interface Campaign {
  type: CampaignType;
  x?: number; // e.g. 2 for Buy 2
  y?: number; // e.g. 1 for Pay 1
  bundlePrice?: number; // For BUNDLE_FIXED_PRICE
  percent?: number; // For CATEGORY_PERCENT
  productIds?: string[]; // For BUNDLE_FIXED_PRICE
  startTime?: string; // HH:mm (e.g. "14:00")
  endTime?: string; // HH:mm (e.g. "16:00")
}

export interface Product extends BaseEntity {
  companyId: string;
  categoryId?: string | null;
  supplierId?: string | null;
  barcode: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  unitType: UnitType;
  purchasePrice: number;
  purchasePriceMinor?: number;
  salePrice: number;
  wholesalePrice?: number | null;
  salePriceMinor?: number;
  vatRate: VatRate;
  minStock: number;
  isActive: boolean;
  isQuickAccess: boolean;
  quickAccessColor?: string | null;
  quickAccessOrder?: number | null;
  campaign?: Campaign | null;
  expiryDate?: string | null;
}

export interface InvoiceTemplateSection {
  footerNote?: string | null;
  headerText?: string | null;
  label?: string | null;
}

export interface InvoiceTemplateConfig extends BaseEntity {
  companyId: string;
  logoUrl?: string | null;
  sales: InvoiceTemplateSection;
  purchase: InvoiceTemplateSection;
  dispatch: InvoiceTemplateSection;
  taxOffice?: string | null;
  tradeRegistryNo?: string | null;
}

export interface LedgerSummary {
  openingBalance: number;
  totalDebt: number;
  totalPayment: number;
  closingBalance: number;
  dueAmount: number;
  last30DaysPayments: number;
  netChange: number;
}

export type ResolvedPriceTier = 'RETAIL' | 'WHOLESALE';

// ========================
// STOK
// ========================

export interface StockLevel {
  productId: string;
  branchId: string;
  quantity: number;
  updatedAt: string;
}

export interface StockMovement extends BaseEntity {
  productId: string;
  branchId: string;
  userId: string;
  clientRequestId?: string | null;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reference?: string | null;
  note?: string | null;
}

// ========================
// SATIŞ
// ========================

export interface Sale extends BaseEntity {
  companyId: string;
  clientRequestId?: string | null;
  branchId: string;
  registerId: string;
  userId: string;
  sessionId: string;
  customerId?: string | null;
  receiptNumber: string;
  status: SaleStatus;
  subtotal: number;
  totalVat: number;
  totalDiscount: number;
  totalCartDiscount: number;
  grandTotal: number;
  note?: string | null;
}

export interface SaleItem extends BaseEntity {
  saleId: string;
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  vatRate: VatRate;
  vatAmount: number;
  discount: number;
  campaignDiscount?: number;
  purchasePrice: number;
  lineTotal: number;
}

// ========================
// ÖDEME
// ========================

export interface Payment extends BaseEntity {
  saleId: string;
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
}

// ========================
// İADE
// ========================

export interface Refund extends BaseEntity {
  saleId: string;
  companyId: string;
  clientRequestId?: string | null;
  branchId: string;
  registerId: string;
  userId: string;
  receiptNumber: string;
  totalAmount: number;
  reason?: string | null;
}

export interface RefundItem extends BaseEntity {
  refundId: string;
  saleItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  vatRate: VatRate;
  vatAmount: number;
  lineTotal: number;
}

// ========================
// KASA OTURUM (Açılış/Kapanış)
// ========================

export interface RegisterSession extends BaseEntity {
  registerId: string;
  userId: string;
  branchId: string;
  status: RegisterSessionStatus;
  openingBalance: number;
  closingBalance?: number | null;
  expectedBalance?: number | null;
  difference?: number | null;
  totalCashSales: number;
  totalCardSales: number;
  totalRefunds: number;
  totalSalesCount: number;
  closedAt?: string | null;
  note?: string | null;
}

// ========================
// SENKRONİZASYON
// ========================

export interface SyncLog extends BaseEntity {
  registerId: string;
  tableName: string;
  recordId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  status: SyncStatus;
  data: string;
  error?: string | null;
  syncedAt?: string | null;
}

// ========================
// API RESPONSE / REQUEST TİPLERİ
// ========================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
  companyId?: string;
}

export interface LoginResponse {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
  company: Company;
  branch?: Branch;
}

export interface CreateSaleRequest {
  clientRequestId: string;
  registerId: string;
  sessionId: string;
  customerId?: string;
  items: CreateSaleItemRequest[];
  payments: CreatePaymentRequest[];
  totalCartDiscount?: number;
  note?: string;
}

export interface CreateSaleItemRequest {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface CreatePaymentRequest {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface CreateRefundRequest {
  clientRequestId: string;
  saleId: string;
  registerId: string;
  sessionId: string;
  items: CreateRefundItemRequest[];
  reason?: string;
}

export interface CreateRefundItemRequest {
  saleItemId: string;
  quantity: number;
}

/** Sync: kasa → cloud gönderim paketi */
export type SyncPushEntity =
  | 'customerOps'
  | 'productOps'
  | 'purchaseOps'
  | 'refunds'
  | 'sales'
  | 'stockOps'
  | 'supplierOps';
export type SyncPushResultStatus = 'ACCEPTED' | 'FAILED' | 'REPLAYED';

export interface SyncPushSaleEntry {
  localId: string;
  payload: CreateSaleRequest;
}

export interface SyncPushRefundEntry {
  localId: string;
  payload: CreateRefundRequest;
}

export interface SyncPushProductOpEntry {
  localId: string;
  method: 'DELETE' | 'POST' | 'PUT';
  path: string;
  payload: Record<string, unknown>;
}

export interface SyncPushCustomerOpEntry {
  localId: string;
  method: 'DELETE' | 'POST' | 'PUT';
  path: string;
  payload: Record<string, unknown>;
}

export interface SyncPushSupplierOpEntry {
  localId: string;
  method: 'DELETE' | 'POST' | 'PUT';
  path: string;
  payload: Record<string, unknown>;
}

export interface SyncPushPurchaseOpEntry {
  localId: string;
  method: 'DELETE' | 'POST' | 'PUT';
  path: string;
  payload: Record<string, unknown>;
}

export interface SyncPushStockOpEntry {
  localId: string;
  payload: Record<string, unknown>;
}

export interface SyncPushPayload {
  clientSyncAt?: string | null;
  customerOps: SyncPushCustomerOpEntry[];
  cursor?: string | null;
  productOps: SyncPushProductOpEntry[];
  purchaseOps: SyncPushPurchaseOpEntry[];
  registerId: string;
  refunds: SyncPushRefundEntry[];
  sales: SyncPushSaleEntry[];
  stockOps: SyncPushStockOpEntry[];
  supplierOps: SyncPushSupplierOpEntry[];
}

export interface SyncPushEntityResult {
  entity: SyncPushEntity;
  error?: string;
  errorCode?: string;
  localId: string;
  operationKey: string;
  status: SyncPushResultStatus;
}

export interface SyncPushResponsePayload {
  acceptedCount: number;
  errors: string[];
  failedCount: number;
  replayedCount: number;
  resultsByEntity: {
    customerOps: SyncPushEntityResult[];
    productOps: SyncPushEntityResult[];
    purchaseOps: SyncPushEntityResult[];
    refunds: SyncPushEntityResult[];
    sales: SyncPushEntityResult[];
    stockOps: SyncPushEntityResult[];
    supplierOps: SyncPushEntityResult[];
  };
  serverSyncAt: string;
}

/** Sync: cloud → kasa indirme paketi */
export interface SyncHeartbeatPayload {
  clientObservedAt: string;
  lastSyncErrorCode?: string | null;
  lastSyncedAt?: string | null;
  lastSyncStatus: 'DEGRADED' | 'IDLE' | 'OK';
  oldestPendingAgeSec?: number | null;
  pendingCount: number;
  productOps: number;
  queuePeak: number;
  refunds: number;
  registerId: string;
  sales: number;
  stockOps: number;
}

export interface SyncHeartbeatResponsePayload {
  serverObservedAt: string;
}

export interface SyncPullPayload {
  branches: Branch[];
  bundles: Array<{
    bundlePrice: number;
    companyId: string;
    id: string;
    isActive: boolean;
    name: string;
    productIds: string[];
    updatedAt: string;
  }>;
  categories: Category[];
  cursor?: string | null;
  customers: Customer[];
  lastSyncAt: string;
  nextCursor?: string | null;
  products: Product[];
  productsTotalActive?: number;
  purchaseInvoices: Array<PurchaseInvoice & { items: PurchaseInvoiceItem[] }>;
  registers: Register[];
  stockLevels: StockLevel[];
  suppliers: Supplier[];
  users: UserPublic[];
}

// ========================
// TEDARİKÇİ & SATIN ALMA
// ========================

export interface Supplier extends BaseEntity {
  companyId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  balance?: number;
  balanceMinor?: number;
  isActive: boolean;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  type: 'DEBT' | 'PAYMENT';
  amount: number;
  amountMinor?: number;
  description?: string | null;
  invoiceId?: string | null;
  invoice?: {
    id: string;
    invoiceNumber: string;
    documentType: 'ORDER' | 'DISPATCH' | 'INVOICE';
  } | null;
  createdAt: string;
}

export interface PurchaseInvoiceItem extends BaseEntity {
  purchaseInvoiceId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  unitPriceMinor?: number;
  vatRate: number;
  vatAmount: number;
  vatAmountMinor?: number;
  discount: number;
  discountMinor?: number;
  lineTotal: number;
  lineTotalMinor?: number;
}

export interface PurchaseInvoice extends BaseEntity {
  companyId: string;
  branchId: string;
  supplierId: string;
  invoiceNumber: string;
  documentType: 'ORDER' | 'DISPATCH' | 'INVOICE';
  dispatchNumber?: string | null;
  documentDate?: string | null;
  dueDate?: string | null;
  sourceDispatchId?: string | null;
  convertedToInvoiceId?: string | null;
  convertedAt?: string | null;
  totalSubtotal: number;
  totalSubtotalMinor?: number;
  totalVat: number;
  totalVatMinor?: number;
  totalDiscount: number;
  totalDiscountMinor?: number;
  totalGrandTotal: number;
  totalGrandTotalMinor?: number;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  note?: string | null;
}
