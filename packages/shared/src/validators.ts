import { z } from 'zod';
import { UserRole, PaymentMethod, UnitType, VAT_RATES } from './constants';

// ========================
// ORTAK
// ========================

export const idSchema = z.string().uuid();
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ========================
// AUTH
// ========================

export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(4).max(100),
  companyId: z.string().uuid().optional(),
});

export const pinLoginSchema = z.object({
  pin: z.string().length(4).regex(/^\d{4}$/),
  registerId: z.string().uuid(),
});

// ========================
// FİRMA
// ========================

export const createCompanySchema = z.object({
  name: z.string().min(2).max(200),
  taxNumber: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
});

export const updateCompanySchema = createCompanySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ========================
// ŞUBE
// ========================

export const createBranchSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(2).max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
});

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ========================
// KASA
// ========================

export const createRegisterSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const updateRegisterSchema = createRegisterSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ========================
// KULLANICI
// ========================

export const createUserSchema = z.object({
  companyId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  username: z.string().min(3).max(50),
  password: z.string().min(4).max(100),
  pin: z.string().length(4).regex(/^\d{4}$/).optional(),
  fullName: z.string().min(2).max(100),
  role: z.nativeEnum(UserRole),
});

export const updateUserSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(4).max(100).optional(),
  pin: z.string().length(4).regex(/^\d{4}$/).optional().nullable(),
  fullName: z.string().min(2).max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
});

// ========================
// KATEGORİ
// ========================

export const createCategorySchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).default(0),
  color: z.string().max(7).optional(),
  icon: z.string().max(50).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

// ========================
// ÜRÜN
// ========================

export const createProductSchema = z.object({
  companyId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  barcode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  unitType: z.nativeEnum(UnitType).default(UnitType.PIECE),
  purchasePrice: z.number().min(0),
  salePrice: z.number().min(0),
  vatRate: z.number().refine((v) => (VAT_RATES as readonly number[]).includes(v), {
    message: `KDV oranı ${VAT_RATES.join(', ')} değerlerinden biri olmalı`,
  }),
  minStock: z.number().int().min(0).default(0),
  isQuickAccess: z.boolean().default(false),
  quickAccessColor: z.string().max(7).optional(),
  quickAccessOrder: z.number().int().min(0).optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ========================
// SATIŞ
// ========================

export const createSaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().min(0.001),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).default(0),
});

export const createPaymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().min(0),
  reference: z.string().max(100).optional(),
});

export const createSaleSchema = z.object({
  registerId: z.string().uuid(),
  sessionId: z.string().uuid(),
  items: z.array(createSaleItemSchema).min(1),
  payments: z.array(createPaymentSchema).min(1),
  note: z.string().max(500).optional(),
});

// ========================
// İADE
// ========================

export const createRefundItemSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().min(0.001),
});

export const createRefundSchema = z.object({
  saleId: z.string().uuid(),
  registerId: z.string().uuid(),
  sessionId: z.string().uuid(),
  items: z.array(createRefundItemSchema).min(1),
  reason: z.string().max(500).optional(),
});

// ========================
// STOK
// ========================

export const createStockMovementSchema = z.object({
  productId: z.string().uuid(),
  branchId: z.string().uuid(),
  quantity: z.number(),
  reference: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

// ========================
// KASA OTURUM
// ========================

export const openRegisterSessionSchema = z.object({
  registerId: z.string().uuid(),
  openingBalance: z.number().min(0),
});

export const closeRegisterSessionSchema = z.object({
  closingBalance: z.number().min(0),
  note: z.string().max(500).optional(),
});
