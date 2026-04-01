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
  isActive: boolean;
  packageType?: 'MONTHLY' | 'YEARLY';
  packageStatus?: 'ACTIVE' | 'SUSPENDED';
  packageGraceDays?: number;
  packageStartedAt?: string | null;
  packageExpiresAt?: string | null;
  packageGraceEndsAt?: string | null;
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
  username: string;
  passwordHash?: string;
  pin?: string | null;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export interface UserPublic extends Omit<User, 'passwordHash' | 'pin'> {}

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

export interface Product extends BaseEntity {
  companyId: string;
  categoryId?: string | null;
  barcode: string;
  name: string;
  description?: string | null;
  unitType: UnitType;
  purchasePrice: number;
  salePrice: number;
  vatRate: VatRate;
  minStock: number;
  isActive: boolean;
  isQuickAccess: boolean;
  quickAccessColor?: string | null;
  quickAccessOrder?: number | null;
}

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
  branchId: string;
  registerId: string;
  userId: string;
  sessionId: string;
  receiptNumber: string;
  status: SaleStatus;
  subtotal: number;
  totalVat: number;
  totalDiscount: number;
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
  username: string;
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
  registerId: string;
  sessionId: string;
  items: CreateSaleItemRequest[];
  payments: CreatePaymentRequest[];
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
export interface SyncPushPayload {
  registerId: string;
  lastSyncAt: string;
  sales: Sale[];
  saleItems: SaleItem[];
  payments: Payment[];
  refunds: Refund[];
  refundItems: RefundItem[];
  stockMovements: StockMovement[];
  registerSessions: RegisterSession[];
}

/** Sync: cloud → kasa indirme paketi */
export interface SyncPullPayload {
  products: Product[];
  categories: Category[];
  users: UserPublic[];
  branches: Branch[];
  registers: Register[];
  stockLevels: StockLevel[];
  lastSyncAt: string;
}
