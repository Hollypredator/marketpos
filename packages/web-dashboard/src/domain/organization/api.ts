import { requestData, requestOk } from '../../lib/http/api-client';
import { toOptionalString } from '../../lib/format';
import type { Branch, Company } from './types';

function toOptionalPercent(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.min(100, Math.max(0, parsed));
}

export async function listCompaniesApi(): Promise<Company[]> {
  return requestData<Company[]>('/api/companies', {
    query: { limit: '100', page: '1' },
  });
}

export async function createCompanyApi(payload: {
  address: string;
  email: string;
  maxCartDiscountPercent: string;
  maxItemDiscountPercent: string;
  name: string;
  phone: string;
  taxNumber: string;
}): Promise<Company> {
  return requestData<Company>('/api/companies', {
    body: {
      address: toOptionalString(payload.address),
      email: toOptionalString(payload.email),
      maxCartDiscountPercent: toOptionalPercent(payload.maxCartDiscountPercent),
      maxItemDiscountPercent: toOptionalPercent(payload.maxItemDiscountPercent),
      name: payload.name.trim(),
      phone: toOptionalString(payload.phone),
      taxNumber: toOptionalString(payload.taxNumber),
    },
    method: 'POST',
  });
}

export async function updateCompanyApi(
  companyId: string,
  payload: {
    address: string;
    email: string;
    isActive: boolean;
    maxCartDiscountPercent: string;
    maxItemDiscountPercent: string;
    name: string;
    phone: string;
    taxNumber: string;
  },
): Promise<Company> {
  return requestData<Company>(`/api/companies/${companyId}`, {
    body: {
      address: toOptionalString(payload.address),
      email: toOptionalString(payload.email),
      isActive: payload.isActive,
      maxCartDiscountPercent: toOptionalPercent(payload.maxCartDiscountPercent),
      maxItemDiscountPercent: toOptionalPercent(payload.maxItemDiscountPercent),
      name: payload.name.trim(),
      phone: toOptionalString(payload.phone),
      taxNumber: toOptionalString(payload.taxNumber),
    },
    method: 'PUT',
  });
}

export async function deleteCompanyApi(companyId: string): Promise<void> {
  await requestOk(`/api/companies/${companyId}`, { method: 'DELETE' });
}

export async function listBranchesApi(companyId: string): Promise<Branch[]> {
  return requestData<Branch[]>('/api/branches', {
    query: { companyId, limit: '100', page: '1' },
  });
}

export async function createBranchApi(payload: {
  address: string;
  companyId: string;
  name: string;
  phone: string;
}): Promise<Branch> {
  return requestData<Branch>('/api/branches', {
    body: {
      address: toOptionalString(payload.address),
      companyId: payload.companyId,
      name: payload.name.trim(),
      phone: toOptionalString(payload.phone),
    },
    method: 'POST',
  });
}

export async function updateBranchApi(
  branchId: string,
  payload: {
    address: string;
    isActive: boolean;
    name: string;
    phone: string;
  },
): Promise<Branch> {
  return requestData<Branch>(`/api/branches/${branchId}`, {
    body: {
      address: toOptionalString(payload.address),
      isActive: payload.isActive,
      name: payload.name.trim(),
      phone: toOptionalString(payload.phone),
    },
    method: 'PUT',
  });
}

export async function deleteBranchApi(branchId: string): Promise<void> {
  await requestOk(`/api/branches/${branchId}`, { method: 'DELETE' });
}

export interface InvoiceTemplateConfigPayload {
  footerNote: string;
  headerText: string;
  logoUrl: string;
  taxOffice: string;
  tradeRegistryNo: string;
  salesFooterNote: string;
  salesHeaderText: string;
  salesLabel: string;
  purchaseFooterNote: string;
  purchaseHeaderText: string;
  purchaseLabel: string;
  dispatchFooterNote: string;
  dispatchHeaderText: string;
  dispatchLabel: string;
}

export async function fetchInvoiceTemplateApi(companyId: string) {
  return requestData<any>('/api/finance/invoice-templates', {
    query: { companyId },
  });
}

export async function updateInvoiceTemplateApi(companyId: string, payload: InvoiceTemplateConfigPayload) {
  return requestData<any>('/api/finance/invoice-templates', {
    method: 'PUT',
    query: { companyId },
    body: {
      footerNote: toOptionalString(payload.footerNote),
      headerText: toOptionalString(payload.headerText),
      logoUrl: toOptionalString(payload.logoUrl),
      taxOffice: toOptionalString(payload.taxOffice),
      tradeRegistryNo: toOptionalString(payload.tradeRegistryNo),
      sales: {
        footerNote: toOptionalString(payload.salesFooterNote),
        headerText: toOptionalString(payload.salesHeaderText),
        label: toOptionalString(payload.salesLabel),
      },
      purchase: {
        footerNote: toOptionalString(payload.purchaseFooterNote),
        headerText: toOptionalString(payload.purchaseHeaderText),
        label: toOptionalString(payload.purchaseLabel),
      },
      dispatch: {
        footerNote: toOptionalString(payload.dispatchFooterNote),
        headerText: toOptionalString(payload.dispatchHeaderText),
        label: toOptionalString(payload.dispatchLabel),
      },
    },
  });
}
