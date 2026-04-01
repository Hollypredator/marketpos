// Constants & Enums
export {
  UserRole,
  PaymentMethod,
  SaleStatus,
  StockMovementType,
  SyncStatus,
  RegisterSessionStatus,
  ReceiptType,
  UnitType,
  VAT_RATES,
  DEFAULT_VAT_RATE,
  CURRENCY,
} from './constants';

export type { VatRate } from './constants';

// Types
export type {
  BaseEntity,
  Company,
  Branch,
  Register,
  User,
  UserPublic,
  Category,
  Product,
  StockLevel,
  StockMovement,
  Sale,
  SaleItem,
  Payment,
  Refund,
  RefundItem,
  RegisterSession,
  SyncLog,
  ApiResponse,
  PaginatedResponse,
  LoginRequest,
  LoginResponse,
  CreateSaleRequest,
  CreateSaleItemRequest,
  CreatePaymentRequest,
  CreateRefundRequest,
  CreateRefundItemRequest,
  SyncPushPayload,
  SyncPullPayload,
} from './types';

// Validators
export {
  idSchema,
  paginationSchema,
  loginSchema,
  pinLoginSchema,
  createCompanySchema,
  updateCompanySchema,
  createBranchSchema,
  updateBranchSchema,
  createRegisterSchema,
  updateRegisterSchema,
  createUserSchema,
  updateUserSchema,
  createCategorySchema,
  updateCategorySchema,
  createProductSchema,
  updateProductSchema,
  createSaleItemSchema,
  createPaymentSchema,
  createSaleSchema,
  createRefundItemSchema,
  createRefundSchema,
  createStockMovementSchema,
  openRegisterSessionSchema,
  closeRegisterSessionSchema,
} from './validators';

// Utils
export {
  calculateVatFromTotal,
  addVat,
  calculateLineTotal,
  calculateLineVat,
  roundCurrency,
  formatCurrency,
  generateReceiptNumber,
  calculateChange,
} from './utils';
