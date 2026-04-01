// ========================
// ENUM TANIMLARI
// ========================

/** Kullanıcı rolleri */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  CASHIER = 'CASHIER',
  ACCOUNTANT = 'ACCOUNTANT',
}

/** Ödeme yöntemleri */
export enum PaymentMethod {
  CASH = 'CASH',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
}

/** Satış durumu */
export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CANCELLED = 'CANCELLED',
}

/** Stok hareket tipi */
export enum StockMovementType {
  PURCHASE = 'PURCHASE',       // Alım (stok giriş)
  SALE = 'SALE',               // Satış (stok çıkış)
  REFUND = 'REFUND',           // İade (stok giriş)
  ADJUSTMENT = 'ADJUSTMENT',   // Düzeltme
  WASTE = 'WASTE',             // Fire/kayıp
  COUNT = 'COUNT',             // Sayım düzeltme
}

/** Senkronizasyon durumu */
export enum SyncStatus {
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  CONFLICT = 'CONFLICT',
  FAILED = 'FAILED',
}

// ========================
// SABİTLER
// ========================

/** KDV oranları (Türkiye) */
export const VAT_RATES = [1, 10, 20] as const;
export type VatRate = typeof VAT_RATES[number];

/** Varsayılan KDV oranı */
export const DEFAULT_VAT_RATE: VatRate = 10;

/** Para birimi */
export const CURRENCY = {
  code: 'TRY',
  symbol: '₺',
  decimals: 2,
} as const;

/** Kasa açılış/kapanış durumları */
export enum RegisterSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** Fatura/fiş tipi */
export enum ReceiptType {
  SALE = 'SALE',
  REFUND = 'REFUND',
  Z_REPORT = 'Z_REPORT',
}

/** Birim tipleri */
export enum UnitType {
  PIECE = 'PIECE',   // Adet
  KG = 'KG',         // Kilogram (Faz 2)
  LITER = 'LITER',   // Litre (Faz 2)
}
