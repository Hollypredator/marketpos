import { z } from 'zod';

/**
 * NOTE: These are local copies of the schemas from `@marketpos/shared/validators`.
 * We replicate them here because the Electron main process (CommonJS) build 
 * sometimes has issues resolving workspace ESM packages at runtime.
 */

export enum PaymentMethod {
  CASH = 'CASH',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  ON_ACCOUNT = 'ON_ACCOUNT',
}

export enum StockMovementType {
  SALE = 'SALE',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT'
}

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

export const createProductSchema = z.object({
  companyId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  barcode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  salePrice: z.number().min(0),
  vatRate: z.number(),
});

export const updateProductSchema = createProductSchema.partial();

export const createStockMovementSchema = z.object({
  productId: z.string().uuid(),
  branchId: z.string().uuid(),
  type: z.nativeEnum(StockMovementType).optional(),
  quantity: z.number(),
  reference: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});
