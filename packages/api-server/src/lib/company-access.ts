import crypto from 'crypto';

export type CompanyAccessStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'GRACE'
  | 'SUSPENDED'
  | 'UNCONFIGURED';

export type CompanyAccessReasonCode =
  | 'ACTIVE_SUBSCRIPTION'
  | 'COMPANY_DISABLED'
  | 'NO_PACKAGE_DATES'
  | 'PACKAGE_EXPIRED'
  | 'PACKAGE_EXPIRED_GRACE'
  | 'PACKAGE_SUSPENDED';

export type CompanyAccessOperatorAction =
  | 'CHECK_PLAN_DATES'
  | 'CONTACT_SUPPORT'
  | 'NONE'
  | 'RENEW_PACKAGE';

export interface CompanyAccessSource {
  id: string;
  isActive: boolean;
  packageExpiresAt: Date | null;
  packageGraceDays: number;
  packageGraceEndsAt: Date | null;
  packageStatus: 'ACTIVE' | 'SUSPENDED';
}

export interface CompanyAccessSnapshot {
  checkedAt: string;
  companyId: string;
  daysRemaining: number | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  isAccessAllowed: boolean;
  offlineAccessGraceDays: number;
  offlineAccessValidUntil: string;
  operatorAction: CompanyAccessOperatorAction;
  packageGraceDays: number;
  reasonCode: CompanyAccessReasonCode;
  status: CompanyAccessStatus;
  summary: string;
  signature: string;
}

const DEFAULT_OFFLINE_ACCESS_GRACE_DAYS = 365;
const DEFAULT_PACKAGE_GRACE_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_GRACE_DAYS_MAX = 400;
const SUBSCRIPTION_GRACE_DAYS_MIN = 1;
const TURKEY_OFFSET = '+03:00';

const trDateFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
});

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * MILLISECONDS_PER_DAY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function daysUntil(target: Date, now: Date): number {
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) {
    return 0;
  }
  return Math.ceil(diff / MILLISECONDS_PER_DAY);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function readOfflineAccessGraceDays(): number {
  const parsed = Number.parseInt(
    process.env.MARKETPOS_OFFLINE_ACCESS_GRACE_DAYS ??
      `${DEFAULT_OFFLINE_ACCESS_GRACE_DAYS}`,
    10,
  );
  if (!Number.isFinite(parsed)) {
    return DEFAULT_OFFLINE_ACCESS_GRACE_DAYS;
  }
  return Math.min(Math.max(parsed, 1), 400);
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function readTrDateParts(date: Date): { day: number; month: number; year: number } {
  const parts = trDateFormatter.formatToParts(date);
  const yearPart = parts.find((part) => part.type === 'year')?.value ?? '';
  const monthPart = parts.find((part) => part.type === 'month')?.value ?? '';
  const dayPart = parts.find((part) => part.type === 'day')?.value ?? '';
  return {
    day: Number.parseInt(dayPart, 10),
    month: Number.parseInt(monthPart, 10),
    year: Number.parseInt(yearPart, 10),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function normalizePackageGraceDays(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PACKAGE_GRACE_DAYS;
  }
  return clamp(Math.floor(value), SUBSCRIPTION_GRACE_DAYS_MIN, SUBSCRIPTION_GRACE_DAYS_MAX);
}

export function endOfTrDay(date: Date): Date {
  const { day, month, year } = readTrDateParts(date);
  return new Date(`${year}-${pad(month)}-${pad(day)}T23:59:59.999${TURKEY_OFFSET}`);
}

export function normalizePackageExpiresAt(date: Date | null): Date | null {
  if (!date) {
    return null;
  }
  return endOfTrDay(date);
}

export function buildPackageGraceEndsAt(
  packageExpiresAt: Date | null,
  packageGraceDays: number,
): Date | null {
  if (!packageExpiresAt) {
    return null;
  }
  const normalizedExpiresAt = normalizePackageExpiresAt(packageExpiresAt);
  if (!normalizedExpiresAt) {
    return null;
  }
  return endOfTrDay(
    addDays(normalizedExpiresAt, normalizePackageGraceDays(packageGraceDays)),
  );
}

export function calculateQuickRenewedExpiresAt(params: {
  currentExpiresAt: Date | null;
  currentStatus: CompanyAccessStatus;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();
  const activeAnchor =
    (params.currentStatus === 'ACTIVE' || params.currentStatus === 'GRACE') &&
    params.currentExpiresAt
      ? params.currentExpiresAt
      : now;

  const normalizedAnchor = endOfTrDay(activeAnchor);
  const { day, month, year } = readTrDateParts(normalizedAnchor);
  const targetYear = year + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, month));

  return new Date(
    `${targetYear}-${pad(month)}-${pad(clampedDay)}T23:59:59.999${TURKEY_OFFSET}`,
  );
}

function buildOfflineAccessValidUntil(params: {
  checkedAt: Date;
  expiresAt: Date | null;
  graceEndsAt: Date | null;
  isAccessAllowed: boolean;
  offlineAccessGraceDays: number;
}): Date {
  if (!params.isAccessAllowed) {
    return params.checkedAt;
  }

  let validUntil = addDays(params.checkedAt, params.offlineAccessGraceDays);
  if (params.graceEndsAt) {
    validUntil = minDate(validUntil, params.graceEndsAt);
  } else if (params.expiresAt) {
    validUntil = minDate(validUntil, params.expiresAt);
  }
  return validUntil;
}

export function buildCompanyAccessSnapshot(
  company: CompanyAccessSource,
  now = new Date(),
): CompanyAccessSnapshot {
  const offlineAccessGraceDays = readOfflineAccessGraceDays();
  const packageGraceDays = normalizePackageGraceDays(company.packageGraceDays);
  const expiresAt = normalizePackageExpiresAt(company.packageExpiresAt);
  const graceEndsAt = company.packageGraceEndsAt
    ? endOfTrDay(company.packageGraceEndsAt)
    : buildPackageGraceEndsAt(expiresAt, packageGraceDays);

  let status: CompanyAccessStatus;
  let reasonCode: CompanyAccessReasonCode;
  let operatorAction: CompanyAccessOperatorAction;
  let summary: string;
  let isAccessAllowed: boolean;
  let daysRemaining: number | null = null;

  if (!company.isActive) {
    status = 'SUSPENDED';
    reasonCode = 'COMPANY_DISABLED';
    operatorAction = 'CONTACT_SUPPORT';
    summary = 'Firma pasif durumda. Erisim kapatildi.';
    isAccessAllowed = false;
  } else if (company.packageStatus === 'SUSPENDED') {
    status = 'SUSPENDED';
    reasonCode = 'PACKAGE_SUSPENDED';
    operatorAction = 'CONTACT_SUPPORT';
    summary = 'Paket askiya alinmis. Destek ile iletisime gecin.';
    isAccessAllowed = false;
  } else if (!expiresAt) {
    status = 'UNCONFIGURED';
    reasonCode = 'NO_PACKAGE_DATES';
    operatorAction = 'CHECK_PLAN_DATES';
    summary = 'Paket bitis tarihi tanimli degil. Gecici erisim acik.';
    isAccessAllowed = true;
  } else if (now.getTime() <= expiresAt.getTime()) {
    status = 'ACTIVE';
    reasonCode = 'ACTIVE_SUBSCRIPTION';
    operatorAction = 'NONE';
    summary = `Paket aktif. Bitis tarihi ${formatDate(expiresAt)}.`;
    isAccessAllowed = true;
    daysRemaining = daysUntil(expiresAt, now);
  } else if (graceEndsAt && now.getTime() <= graceEndsAt.getTime()) {
    status = 'GRACE';
    reasonCode = 'PACKAGE_EXPIRED_GRACE';
    operatorAction = 'RENEW_PACKAGE';
    summary = `Paket suresi doldu. Yenileme icin son tarih ${formatDate(graceEndsAt)}.`;
    isAccessAllowed = true;
    daysRemaining = daysUntil(graceEndsAt, now);
  } else {
    status = 'EXPIRED';
    reasonCode = 'PACKAGE_EXPIRED';
    operatorAction = 'RENEW_PACKAGE';
    summary = graceEndsAt
      ? `Paket yenilenmedigi icin erisim kapatildi. Son tarih ${formatDate(graceEndsAt)}.`
      : `Paket suresi ${formatDate(expiresAt)} tarihinde bitti. Erisim kapatildi.`;
    isAccessAllowed = false;
    daysRemaining = 0;
  }

  const offlineAccessValidUntil = buildOfflineAccessValidUntil({
    checkedAt: now,
    expiresAt,
    graceEndsAt,
    isAccessAllowed,
    offlineAccessGraceDays,
  });

  const snapshotWithoutSignature = {
    checkedAt: now.toISOString(),
    companyId: company.id,
    daysRemaining,
    expiresAt: toIsoOrNull(expiresAt),
    graceEndsAt: toIsoOrNull(graceEndsAt),
    isAccessAllowed,
    offlineAccessGraceDays,
    offlineAccessValidUntil: offlineAccessValidUntil.toISOString(),
    operatorAction,
    packageGraceDays,
    reasonCode,
    status,
    summary,
  };

  const dataToSign = `${snapshotWithoutSignature.companyId}|${snapshotWithoutSignature.offlineAccessValidUntil}|${snapshotWithoutSignature.status}`;
  const signature = crypto
    .createHmac('sha256', 'marketpos-offline-license-verification-secret-token-key')
    .update(dataToSign)
    .digest('hex');

  return {
    ...snapshotWithoutSignature,
    signature,
  };
}
