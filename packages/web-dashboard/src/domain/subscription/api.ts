import { requestData, requestEnvelope } from '../../lib/http/api-client';
import { intNum, toOptionalString } from '../../lib/format';
import type { ApiEnvelope, SubscriptionAuditRow, SubscriptionCompanyRow, SubscriptionSummary } from '../shared/types';
import type {
  ProvisionCompanyResult,
  ProvisionTemplateSummary,
  SubscriptionFilters,
  SubscriptionProvisionForm,
} from './types';

export async function listSubscriptionCompaniesApi(filters: SubscriptionFilters): Promise<{
  rows: SubscriptionCompanyRow[];
  summary: SubscriptionSummary;
}> {
  const dueInDays = Number.parseInt(filters.dueInDays, 10);
  const query: Record<string, string | undefined> = {
    limit: '100',
    page: '1',
    search: toOptionalString(filters.search),
    status: filters.status || undefined,
  };
  if (Number.isFinite(dueInDays) && dueInDays >= 0) {
    query.dueInDays = String(dueInDays);
  }

  const payload = (await requestEnvelope<SubscriptionCompanyRow[]>(
    '/api/subscription/admin/companies',
    { query },
  )) as ApiEnvelope<SubscriptionCompanyRow[]> & { summary?: SubscriptionSummary };

  return {
    rows: payload.data ?? [],
    summary: payload.summary ?? {
      ACTIVE: 0,
      EXPIRED: 0,
      GRACE: 0,
      SUSPENDED: 0,
      UNCONFIGURED: 0,
    },
  };
}

export async function listSubscriptionAuditApi(companyId: string): Promise<{
  pagination: {
    page: number;
    total: number;
    totalPages: number;
  };
  rows: SubscriptionAuditRow[];
}> {
  const payload = await requestEnvelope<SubscriptionAuditRow[]>(
    `/api/subscription/admin/companies/${companyId}/audit`,
    {
      query: { limit: '20', page: '1' },
    },
  );
  return {
    pagination: {
      page: payload.pagination?.page ?? 1,
      total: payload.pagination?.total ?? 0,
      totalPages: payload.pagination?.totalPages ?? 1,
    },
    rows: payload.data ?? [],
  };
}

export async function quickRenewSubscriptionApi(params: {
  companyId: string;
  note: string;
}): Promise<void> {
  await requestData(`/api/subscription/admin/companies/${params.companyId}/renew-quick`, {
    body: { note: toOptionalString(params.note) },
    method: 'POST',
  });
}

export async function suspendSubscriptionApi(params: {
  companyId: string;
  note: string;
}): Promise<void> {
  await requestData(`/api/subscription/admin/companies/${params.companyId}/suspend`, {
    body: { note: params.note },
    method: 'POST',
  });
}

export async function unsuspendSubscriptionApi(params: {
  companyId: string;
  note: string;
}): Promise<void> {
  await requestData(`/api/subscription/admin/companies/${params.companyId}/unsuspend`, {
    body: { note: params.note },
    method: 'POST',
  });
}

export async function saveSubscriptionPlanApi(params: {
  companyId: string;
  note: string;
  packageExpiresAt: string;
  packageGraceDays: string;
  packageStartedAt: string;
  packageStatus: 'ACTIVE' | 'SUSPENDED';
}): Promise<void> {
  await requestData(`/api/subscription/admin/companies/${params.companyId}/plan`, {
    body: {
      note: params.note,
      packageExpiresAt: params.packageExpiresAt.trim().length > 0 ? params.packageExpiresAt : null,
      packageGraceDays: intNum(params.packageGraceDays, 7),
      packageStartedAt:
        params.packageStartedAt.trim().length > 0 ? params.packageStartedAt : null,
      packageStatus: params.packageStatus,
    },
    method: 'PUT',
  });
}

export async function listProvisionTemplatesApi(): Promise<ProvisionTemplateSummary[]> {
  return requestData<ProvisionTemplateSummary[]>('/api/subscription/admin/templates');
}

export async function provisionCompanyApi(
  params: SubscriptionProvisionForm,
): Promise<ProvisionCompanyResult> {
  return requestData<ProvisionCompanyResult>('/api/subscription/admin/provision', {
    body: {
      address: toOptionalString(params.address),
      adminEmail: toOptionalString(params.adminEmail)?.toLowerCase(),
      adminFullName: params.adminFullName.trim(),
      adminPassword: params.adminPassword,
      adminUsername: params.adminUsername.trim(),
      branchName: params.branchName.trim(),
      companyId: toOptionalString(params.companyId),
      companyName: toOptionalString(params.companyName),
      email: toOptionalString(params.email),
      graceDays: intNum(params.graceDays, 7),
      overwriteStock: params.overwriteStock,
      packageDays: intNum(params.packageDays, 365),
      phone: toOptionalString(params.phone),
      registerName: params.registerName.trim(),
      taxNumber: toOptionalString(params.taxNumber),
      templateCode: params.templateCode.trim(),
    },
    method: 'POST',
  });
}

export async function generateLicenseKeyApi(companyId: string): Promise<string> {
  const result = await requestData<{ licenseKey: string }>(
    `/api/subscription/admin/companies/${companyId}/generate-license`,
    { method: 'POST' }
  );
  return result.licenseKey;
}
