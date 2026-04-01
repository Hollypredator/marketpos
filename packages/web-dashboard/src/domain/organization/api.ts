import { requestData, requestOk } from '../../lib/http/api-client';
import { toOptionalString } from '../../lib/format';
import type { Branch, Company } from './types';

export async function listCompaniesApi(): Promise<Company[]> {
  return requestData<Company[]>('/api/companies', {
    query: { limit: '100', page: '1' },
  });
}

export async function createCompanyApi(payload: {
  address: string;
  email: string;
  name: string;
  phone: string;
  taxNumber: string;
}): Promise<Company> {
  return requestData<Company>('/api/companies', {
    body: {
      address: toOptionalString(payload.address),
      email: toOptionalString(payload.email),
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
