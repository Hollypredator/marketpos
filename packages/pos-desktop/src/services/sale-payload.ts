import type { PendingSaleItem } from './types';

interface CartLineSnapshot {
  discountAmount?: number;
  campaignDiscount?: number;
  isCompliment?: boolean;
  lineTotal: number;
  productId: string;
  quantity: number;
  unitPrice: number;
}

interface SaleItemDraft {
  discount: number;
  gross: number;
  productId: string;
  quantity: number;
  unitPrice: number;
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function clampCurrency(value: number, min: number, max: number): number {
  return roundCurrency(Math.max(min, Math.min(max, value)));
}

export function buildPendingSaleItems(
  cart: CartLineSnapshot[],
): PendingSaleItem[] {
  return cart.map((item) => {
    const quantity = Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
    const unitPrice = Number.isFinite(item.unitPrice) ? Math.max(0, item.unitPrice) : 0;
    const gross = roundCurrency(quantity * unitPrice);
    const lineTotal = clampCurrency(item.lineTotal, 0, gross);
    const complimentDiscount = item.isCompliment ? gross : 0;
    const lineDerivedDiscount = Math.max(0, gross - lineTotal);
    const manualDiscount = Number.isFinite(item.discountAmount)
      ? Math.max(0, item.discountAmount ?? 0)
      : 0;

    const discount = clampCurrency(
      Math.max(complimentDiscount, Math.max(lineDerivedDiscount, manualDiscount)),
      0,
      gross,
    );

    const campaignDiscount = roundCurrency(item.campaignDiscount || 0);

    return {
      ...(discount > 0 ? { discount } : {}),
      ...(campaignDiscount > 0 ? { campaignDiscount } : {}),
      productId: item.productId,
      quantity,
      unitPrice,
    };
  });
}

