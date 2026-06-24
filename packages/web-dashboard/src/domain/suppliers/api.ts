import type { PaginatedResponse } from '../shared/types';
import { requestData, requestEnvelope, requestOk } from '../../lib/http/api-client';

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  balance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  type: 'DEBT' | 'PAYMENT';
  amount: number;
  description?: string;
  invoiceId?: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    documentType: 'ORDER' | 'DISPATCH' | 'INVOICE';
  } | null;
  createdAt: string;
}

export interface SupplierTransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  page?: number;
  type?: 'DEBT' | 'PAYMENT';
}

export async function fetchSuppliersApi(
  companyId: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<Supplier>> {
  const envelope = await requestEnvelope<Supplier[]>('/api/suppliers', {
    query: {
      companyId,
      limit: String(limit),
      page: String(page),
    },
  });
  return {
    data: envelope.data ?? [],
    pagination: envelope.pagination ?? {
      limit,
      page,
      total: envelope.data?.length ?? 0,
      totalPages: 1,
    },
    success: envelope.success,
  };
}

export async function createSupplierApi(
  companyId: string,
  payload: SupplierForm,
): Promise<Supplier> {
  return requestData<Supplier>('/api/suppliers', {
    body: {
      ...payload,
      companyId,
    },
    method: 'POST',
  });
}

export async function updateSupplierApi(
  id: string,
  payload: Partial<SupplierForm>,
): Promise<Supplier> {
  return requestData<Supplier>(`/api/suppliers/${id}`, {
    body: payload,
    method: 'PUT',
  });
}

export async function deleteSupplierApi(id: string): Promise<void> {
  await requestOk(`/api/suppliers/${id}`, { method: 'DELETE' });
}

export async function fetchSupplierTransactionsApi(
  supplierId: string,
  filters?: SupplierTransactionFilters,
): Promise<PaginatedResponse<SupplierTransaction>> {
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;

  const envelope = await requestEnvelope<SupplierTransaction[]>(
    `/api/suppliers/${supplierId}/transactions`,
    {
      query: {
        dateFrom: filters?.dateFrom,
        dateTo: filters?.dateTo,
        limit: String(limit),
        page: String(page),
        type: filters?.type,
      },
    },
  );

  return {
    data: envelope.data ?? [],
    pagination: envelope.pagination ?? {
      limit,
      page,
      total: envelope.data?.length ?? 0,
      totalPages: 1,
    },
    success: envelope.success,
  };
}

export async function createSupplierTransactionApi(
  supplierId: string,
  payload: {
    type: 'DEBT' | 'PAYMENT';
    amount: number;
    description?: string;
    invoiceId?: string;
  },
): Promise<SupplierTransaction> {
  return requestData<SupplierTransaction>(`/api/suppliers/${supplierId}/transactions`, {
    method: 'POST',
    body: payload,
  });
}
