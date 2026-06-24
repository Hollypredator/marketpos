import type { Campaign } from '@marketpos/shared';

function toCampaign(value: unknown): Campaign | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Partial<Campaign>;
  if (
    record.type !== 'BUY_X_PAY_Y' &&
    record.type !== 'BUNDLE_FIXED_PRICE' &&
    record.type !== 'CATEGORY_PERCENT'
  ) {
    return null;
  }
  return record as Campaign;
}

export function calculateCampaignDiscount(
  quantity: number,
  unitPrice: number,
  campaign: Campaign | Record<string, unknown> | null | undefined,
): number {
  const normalized = toCampaign(campaign);
  if (!normalized || quantity <= 0) {
    return 0;
  }

  if (normalized.type === 'BUY_X_PAY_Y') {
    const x = normalized.x ?? 0;
    const y = normalized.y ?? 0;
    if (x <= 0 || y <= 0 || y >= x) {
      return 0;
    }

    const sets = Math.floor(quantity / x);
    const freeItemsCount = sets * (x - y);
    return freeItemsCount * unitPrice;
  }

  return 0;
}

export function getCampaignLabel(
  campaign: Campaign | Record<string, unknown> | null | undefined,
): string | null {
  const normalized = toCampaign(campaign);
  if (!normalized) {
    return null;
  }

  if (normalized.type === 'BUY_X_PAY_Y') {
    return `${normalized.x ?? 0} Al ${normalized.y ?? 0} Ode`;
  }

  return null;
}
