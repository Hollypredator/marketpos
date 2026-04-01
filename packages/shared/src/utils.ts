/**
 * Fiyat hesaplama yardımcı fonksiyonları
 */

import { VatRate, CURRENCY } from './constants';

/**
 * KDV dahil fiyattan KDV tutarını hesapla
 */
export function calculateVatFromTotal(totalWithVat: number, vatRate: VatRate): number {
  const vatAmount = totalWithVat - (totalWithVat / (1 + vatRate / 100));
  return roundCurrency(vatAmount);
}

/**
 * KDV hariç fiyata KDV ekle
 */
export function addVat(priceWithoutVat: number, vatRate: VatRate): number {
  return roundCurrency(priceWithoutVat * (1 + vatRate / 100));
}

/**
 * Satır toplamı hesapla (adet × birim fiyat - indirim)
 */
export function calculateLineTotal(
  quantity: number,
  unitPrice: number,
  discount: number = 0
): number {
  return roundCurrency(quantity * unitPrice - discount);
}

/**
 * Satır KDV tutarı hesapla
 */
export function calculateLineVat(
  lineTotal: number,
  vatRate: VatRate
): number {
  return calculateVatFromTotal(lineTotal, vatRate);
}

/**
 * Para biriminde yuvarlama (2 basamak)
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * Math.pow(10, CURRENCY.decimals)) / Math.pow(10, CURRENCY.decimals);
}

/**
 * Fiyatı formatla (₺12,50)
 */
export function formatCurrency(amount: number): string {
  return `${CURRENCY.symbol}${amount.toFixed(CURRENCY.decimals).replace('.', ',')}`;
}

/**
 * Fiş numarası oluştur
 * Format: YYYYMMDD-KASAID-SIRA (örn: 20260330-K01-000123)
 */
export function generateReceiptNumber(
  registerShortId: string,
  sequenceNumber: number,
  date: Date = new Date()
): string {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(sequenceNumber).padStart(6, '0');
  return `${dateStr}-${registerShortId}-${seq}`;
}

/**
 * Para üstü hesapla
 */
export function calculateChange(grandTotal: number, paidAmount: number): number {
  const change = paidAmount - grandTotal;
  return roundCurrency(Math.max(0, change));
}
