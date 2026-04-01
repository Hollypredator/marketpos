import type {
  CompanyAccessStatus as DbCompanyAccessStatus,
  CompanySubscriptionAuditEventType,
} from '@prisma/client';

const RESTRICTED_SUBSCRIPTION_FIELDS = new Set([
  'packageType',
  'packageStatus',
  'packageGraceDays',
  'packageStartedAt',
  'packageExpiresAt',
  'packageGraceEndsAt',
]);

export function findRestrictedSubscriptionFields(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [];
  }
  return Object.keys(body).filter((field) => RESTRICTED_SUBSCRIPTION_FIELDS.has(field));
}

export function mapSystemEventType(
  previousStatus: DbCompanyAccessStatus | null,
  nextStatus: DbCompanyAccessStatus,
): CompanySubscriptionAuditEventType | null {
  if (nextStatus === 'GRACE' && previousStatus !== 'GRACE') {
    return 'SYSTEM_ENTER_GRACE';
  }
  if (nextStatus === 'EXPIRED' && previousStatus !== 'EXPIRED') {
    return 'SYSTEM_BLOCK_EXPIRED';
  }
  if (
    nextStatus === 'ACTIVE' &&
    previousStatus !== null &&
    previousStatus !== 'ACTIVE'
  ) {
    return 'SYSTEM_RESTORE_ACTIVE';
  }
  return null;
}
