import type { BackofficeSettings } from '../electron-api';

export interface DiscountPolicy {
  maxCartDiscountAmount: number;
  maxCartDiscountPercent: number;
  maxItemDiscountAmount: number;
  maxItemDiscountPercent: number;
}

const LEGACY_DISCOUNT_POLICY_STORAGE_KEY = 'marketpos:sales:discount-policy:v1';
const MIGRATION_MARKER_KEY = 'marketpos:sales:discount-policy:migrated:v2';
const DISCOUNT_POLICY_EVENT = 'marketpos:discount-policy-updated';
const DEFAULT_DISCOUNT_POLICY: DiscountPolicy = {
  maxCartDiscountAmount: 500,
  maxCartDiscountPercent: 25,
  maxItemDiscountAmount: 250,
  maxItemDiscountPercent: 40,
};

let cachedPolicy: DiscountPolicy = { ...DEFAULT_DISCOUNT_POLICY };

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, value));
}

function clampAmount(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, value);
}

function normalizePolicy(policy: Partial<DiscountPolicy>): DiscountPolicy {
  return {
    maxCartDiscountAmount: clampAmount(
      Number(policy.maxCartDiscountAmount),
      DEFAULT_DISCOUNT_POLICY.maxCartDiscountAmount,
    ),
    maxCartDiscountPercent: clampPercent(
      Number(policy.maxCartDiscountPercent),
      DEFAULT_DISCOUNT_POLICY.maxCartDiscountPercent,
    ),
    maxItemDiscountAmount: clampAmount(
      Number(policy.maxItemDiscountAmount),
      DEFAULT_DISCOUNT_POLICY.maxItemDiscountAmount,
    ),
    maxItemDiscountPercent: clampPercent(
      Number(policy.maxItemDiscountPercent),
      DEFAULT_DISCOUNT_POLICY.maxItemDiscountPercent,
    ),
  };
}

function getStorageKey(companyId?: string | null): string {
  const normalizedCompanyId = typeof companyId === 'string' ? companyId.trim() : '';
  if (normalizedCompanyId.length === 0) {
    return LEGACY_DISCOUNT_POLICY_STORAGE_KEY;
  }
  return `${LEGACY_DISCOUNT_POLICY_STORAGE_KEY}:${normalizedCompanyId}`;
}

function readLegacyPolicy(companyId?: string | null): DiscountPolicy | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(getStorageKey(companyId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DiscountPolicy>;
    return normalizePolicy({
      maxCartDiscountPercent: Number(parsed.maxCartDiscountPercent),
      maxItemDiscountPercent: Number(parsed.maxItemDiscountPercent),
    });
  } catch {
    return null;
  }
}

function patchToSettings(policy: DiscountPolicy): Partial<BackofficeSettings> {
  return {
    discountPolicy: {
      maxCartDiscountAmount: policy.maxCartDiscountAmount,
      maxCartDiscountPercent: policy.maxCartDiscountPercent,
      maxItemDiscountAmount: policy.maxItemDiscountAmount,
      maxItemDiscountPercent: policy.maxItemDiscountPercent,
    },
  };
}

function notifyPolicyUpdated(policy: DiscountPolicy): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<DiscountPolicy>(DISCOUNT_POLICY_EVENT, { detail: policy }),
  );
}

async function migrateLegacyPolicyIfNeeded(companyId?: string | null): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return;
  }
  const markerKey =
    companyId && companyId.trim().length > 0
      ? `${MIGRATION_MARKER_KEY}:${companyId.trim()}`
      : MIGRATION_MARKER_KEY;
  const alreadyMigrated = window.localStorage.getItem(markerKey);
  if (alreadyMigrated === '1') {
    return;
  }

  const legacyPolicy = readLegacyPolicy(companyId);
  if (legacyPolicy) {
    await window.electronAPI.setBackofficeSettings({
      patch: patchToSettings(legacyPolicy),
    });
    window.localStorage.removeItem(getStorageKey(companyId));
  }
  window.localStorage.setItem(markerKey, '1');
}

export function readDiscountPolicy(_companyId?: string | null): DiscountPolicy {
  return { ...cachedPolicy };
}

export async function loadDiscountPolicy(companyId?: string | null): Promise<DiscountPolicy> {
  await migrateLegacyPolicyIfNeeded(companyId);
  if (typeof window !== 'undefined' && window.electronAPI) {
    const settings = await window.electronAPI.getBackofficeSettings();
    cachedPolicy = normalizePolicy(settings.discountPolicy);
  }
  return { ...cachedPolicy };
}

export async function saveDiscountPolicy(policy: DiscountPolicy): Promise<DiscountPolicy> {
  const normalized = normalizePolicy(policy);
  cachedPolicy = normalized;
  if (typeof window !== 'undefined' && window.electronAPI) {
    const settings = await window.electronAPI.setBackofficeSettings({
      patch: patchToSettings(normalized),
    });
    cachedPolicy = normalizePolicy(settings.discountPolicy);
  }
  notifyPolicyUpdated(cachedPolicy);
  return { ...cachedPolicy };
}

export async function saveDiscountPolicyForCompany(
  policy: DiscountPolicy,
  _companyId?: string | null,
  operatorUserId?: string | null,
): Promise<DiscountPolicy> {
  const normalized = normalizePolicy(policy);
  cachedPolicy = normalized;
  if (typeof window !== 'undefined' && window.electronAPI) {
    const settings = await window.electronAPI.setBackofficeSettings({
      operatorUserId: operatorUserId ?? null,
      patch: patchToSettings(normalized),
    });
    cachedPolicy = normalizePolicy(settings.discountPolicy);
  }
  notifyPolicyUpdated(cachedPolicy);
  return { ...cachedPolicy };
}

export function subscribeDiscountPolicy(listener: (policy: DiscountPolicy) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const handler = (event: Event): void => {
    const customEvent = event as CustomEvent<DiscountPolicy>;
    if (customEvent.detail) {
      listener(customEvent.detail);
    }
  };
  window.addEventListener(DISCOUNT_POLICY_EVENT, handler);
  return () => {
    window.removeEventListener(DISCOUNT_POLICY_EVENT, handler);
  };
}

function parseLocalizedNumber(rawValue: string): number | null {
  const compact = rawValue.replace(/\s+/g, '');
  if (compact.length === 0) {
    return null;
  }

  const separatorMatches = [...compact.matchAll(/[.,]/g)];
  let normalized = compact;
  if (separatorMatches.length > 0) {
    const decimalIndex = separatorMatches[separatorMatches.length - 1].index ?? -1;
    const integerPartRaw = compact.slice(0, decimalIndex).replace(/[.,]/g, '');
    const fractionPartRaw = compact.slice(decimalIndex + 1).replace(/[.,]/g, '');
    const integerPart = integerPartRaw.length > 0 ? integerPartRaw : '0';
    normalized =
      fractionPartRaw.length > 0 ? `${integerPart}.${fractionPartRaw}` : integerPart;
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export function parseDiscountInput(rawInput: string, baseAmount: number): number | null {
  const normalized = rawInput.trim();
  if (normalized.length === 0) {
    return null;
  }

  const isPercent = normalized.startsWith('%') || normalized.endsWith('%');
  const amountRaw = normalized
    .replace(/%/g, '')
    .replace(/[A-Za-z]/g, '')
    .trim();
  const amount = parseLocalizedNumber(amountRaw);
  if (amount === null || amount < 0) {
    return null;
  }

  if (isPercent) {
    return (Math.max(0, baseAmount) * amount) / 100;
  }

  return amount;
}

export function capDiscountByPercent(
  discountAmount: number,
  baseAmount: number,
  maxPercent: number,
): number {
  const safeBase = Math.max(0, baseAmount);
  const safeDiscount = Math.max(0, discountAmount);
  const maxAllowed = (safeBase * clampPercent(maxPercent, 0)) / 100;
  return Math.min(safeBase, Math.min(safeDiscount, maxAllowed));
}

export function capDiscountByPolicy(
  discountAmount: number,
  baseAmount: number,
  policy: DiscountPolicy,
  scope: 'CART' | 'ITEM',
): number {
  const safeBase = Math.max(0, baseAmount);
  const safeDiscount = Math.max(0, discountAmount);
  const percentLimited = capDiscountByPercent(
    safeDiscount,
    safeBase,
    scope === 'ITEM'
      ? policy.maxItemDiscountPercent
      : policy.maxCartDiscountPercent,
  );
  const amountLimit =
    scope === 'ITEM' ? policy.maxItemDiscountAmount : policy.maxCartDiscountAmount;
  return Math.min(percentLimited, amountLimit);
}
