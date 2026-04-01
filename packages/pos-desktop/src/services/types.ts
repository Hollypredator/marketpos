import type { PaymentMethod } from '@marketpos/shared';
import type {
  BackupFileRecord,
  BackupPolicy,
  BackupPolicyState,
  CashMovementRecord,
  CashMovementType,
  CompanyAccessSnapshot,
  HardwareConfig,
  HardwareErrorCode,
  HardwareOperatorAction,
  LogSecurityEventPayload,
  ManagerUnlockMethod,
  RecordCashMovementPayload,
  RecordShiftHandoverPayload,
  SecurityEventRecord,
  ShiftHandoverRecord,
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
  companyAccess: CompanyAccessSnapshot | null;
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
  items: PendingSaleItem[];
  note?: string;
  payments: PendingSalePayment[];
  registerId: string;
  sessionId: string;
}

export interface PendingRefundItem {
  quantity: number;
  saleItemId: string;
}

export interface PendingRefund {
  items: PendingRefundItem[];
  reason?: string;
  registerId: string;
  saleId: string;
  sessionId: string;
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
  categoryId?: string;
  isQuickAccess?: boolean;
  minStock: number;
  name: string;
  purchasePrice: number;
  quickAccessOrder?: number;
  salePrice: number;
  vatRate: number;
}

export interface UpdateProductInput {
  barcode?: string;
  categoryId?: string;
  isQuickAccess?: boolean;
  minStock?: number;
  name?: string;
  quickAccessOrder?: number;
  salePrice?: number;
  vatRate?: number;
}

export interface SyncState {
  errors: string[];
  isRunning: boolean;
  lastSyncAt: string | null;
  queueRefunds: number;
  queueSales: number;
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
};

export type { HardwareConfig };
