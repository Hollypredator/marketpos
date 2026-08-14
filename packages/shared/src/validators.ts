import { z } from 'zod';
import {
  UserRole,
  PaymentMethod,
  StockMovementType,
  UnitType,
  VAT_RATES,
} from './constants';

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
  email: z.string().trim().email().max(255).optional(),
  username: z.string().trim().min(3).max(50).optional(),
  password: z.string().min(4).max(100),
  companyId: z.string().trim().min(1).max(100).optional(),
}).superRefine((payload, ctx) => {
  const hasEmail = typeof payload.email === 'string' && payload.email.trim().length > 0;
  const hasUsername = typeof payload.username === 'string' && payload.username.trim().length > 0;
  if (!hasEmail && !hasUsername) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Email veya kullanici adi zorunludur',
      path: ['email'],
    });
  }
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
  maxItemDiscountPercent: z.number().min(0).max(100).optional(),
  maxCartDiscountPercent: z.number().min(0).max(100).optional(),
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
  email: z.string().trim().email().max(255).optional(),
  username: z.string().min(3).max(50),
  password: z.string().min(4).max(100),
  pin: z.string().length(4).regex(/^\d{4}$/).optional(),
  fullName: z.string().min(2).max(100),
  role: z.nativeEnum(UserRole),
});

export const updateUserSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(4).max(100).optional(),
  pin: z.string().length(4).regex(/^\d{4}$/).optional().nullable(),
  fullName: z.string().min(2).max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
});

// ========================
// MUSTERI
// ========================

export const createCustomerSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(255).optional(),
  address: z.string().trim().max(500).optional(),
  taxNumber: z.string().trim().max(20).optional(),
  priceTier: z.enum(['RETAIL', 'WHOLESALE']).optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  taxNumber: z.string().trim().max(20).optional().nullable(),
  priceTier: z.enum(['RETAIL', 'WHOLESALE']).optional(),
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
  id: z.string().uuid().optional(),
  clientRequestId: z.string().trim().min(8).max(120).optional(),
  companyId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  barcode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  brand: z.string().trim().max(120).optional().nullable(),
  description: z.string().max(500).optional(),
  unitType: z.nativeEnum(UnitType).default(UnitType.PIECE),
  purchasePrice: z.number().min(0),
  salePrice: z.number().min(0),
  wholesalePrice: z.number().min(0).optional().nullable(),
  vatRate: z.number().refine((v) => (VAT_RATES as readonly number[]).includes(v), {
    message: `KDV oranı ${VAT_RATES.join(', ')} değerlerinden biri olmalı`,
  }),
  minStock: z.number().int().min(0).default(0),
  isQuickAccess: z.boolean().default(false),
  quickAccessColor: z.string().max(7).optional(),
  quickAccessOrder: z.number().int().min(0).optional(),
  expiryDate: z.string().datetime().optional().nullable(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const bulkProductUpdateModeSchema = z.enum([
  'SET_PRICE',
  'ADJUST_PRICE_PERCENT',
  'SET_MIN_STOCK',
  'MOVE_CATEGORY',
  'SET_ACTIVE',
]);

export const bulkProductUpdateSchema = z
  .object({
    companyId: z.string().uuid(),
    productIds: z.array(z.string().uuid()).min(1).max(500),
    mode: bulkProductUpdateModeSchema,
    previewOnly: z.boolean().default(false),
    salePrice: z.number().min(0).optional(),
    percentage: z.number().min(-100).max(1000).optional(),
    minStock: z.number().int().min(0).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.mode === 'SET_PRICE' && typeof payload.salePrice !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SET_PRICE icin salePrice zorunludur',
        path: ['salePrice'],
      });
    }
    if (
      payload.mode === 'ADJUST_PRICE_PERCENT' &&
      typeof payload.percentage !== 'number'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ADJUST_PRICE_PERCENT icin percentage zorunludur',
        path: ['percentage'],
      });
    }
    if (payload.mode === 'SET_MIN_STOCK' && typeof payload.minStock !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SET_MIN_STOCK icin minStock zorunludur',
        path: ['minStock'],
      });
    }
    if (payload.mode === 'MOVE_CATEGORY' && typeof payload.categoryId === 'undefined') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MOVE_CATEGORY icin categoryId zorunludur (null olabilir)',
        path: ['categoryId'],
      });
    }
    if (payload.mode === 'SET_ACTIVE' && typeof payload.isActive !== 'boolean') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SET_ACTIVE icin isActive zorunludur',
        path: ['isActive'],
      });
    }
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
  clientRequestId: z.string().trim().min(8).max(120),
  registerId: z.string().uuid(),
  sessionId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  items: z.array(createSaleItemSchema).min(1),
  payments: z.array(createPaymentSchema).min(1),
  totalCartDiscount: z.number().min(0).optional(),
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
  clientRequestId: z.string().trim().min(8).max(120),
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
  clientRequestId: z.string().trim().min(8).max(120).optional(),
  productId: z.string().uuid(),
  branchId: z.string().uuid(),
  type: z.nativeEnum(StockMovementType).optional(),
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
  declaredCash: z.number().min(0).optional(),
  note: z.string().max(500).optional(),
});

// ========================
// TEDARİKÇİ & SATIN ALMA
// ========================

export const createSupplierSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  taxNumber: z.string().max(50).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createPurchaseInvoiceItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().min(0.001),
  unitPrice: z.number().min(0),
  vatRate: z.number().int().min(0).max(100),
  discount: z.number().min(0).default(0),
});

export const createPurchaseInvoiceSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().min(1).max(50),
  documentType: z.enum(['ORDER', 'DISPATCH', 'INVOICE']).default('INVOICE'),
  dispatchNumber: z.string().trim().max(50).optional(),
  documentDate: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  items: z.array(createPurchaseInvoiceItemSchema).min(1),
  totalDiscount: z.number().min(0).default(0),
  note: z.string().max(500).optional(),
}).superRefine((payload, ctx) => {
  if (
    (payload.documentType === 'DISPATCH' || payload.documentType === 'INVOICE') &&
    !payload.documentDate
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${payload.documentType} belge tipi icin documentDate zorunludur`,
      path: ['documentDate'],
    });
  }

  if (
    payload.documentType === 'DISPATCH' &&
    (!payload.dispatchNumber || payload.dispatchNumber.trim().length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DISPATCH belge tipi icin dispatchNumber zorunludur',
      path: ['dispatchNumber'],
    });
  }

  if (payload.documentType !== 'DISPATCH' && payload.dispatchNumber) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'dispatchNumber sadece DISPATCH belge tipi icin gonderilebilir',
      path: ['dispatchNumber'],
    });
  }

  if (payload.documentType === 'INVOICE' && !payload.dueDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'INVOICE belge tipi icin dueDate zorunludur',
      path: ['dueDate'],
    });
  }

  if (payload.documentDate && payload.dueDate) {
    const documentDate = new Date(payload.documentDate);
    const dueDate = new Date(payload.dueDate);
    if (
      Number.isFinite(documentDate.getTime()) &&
      Number.isFinite(dueDate.getTime()) &&
      dueDate.getTime() < documentDate.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dueDate, documentDate tarihinden once olamaz',
        path: ['dueDate'],
      });
    }
  }
});
