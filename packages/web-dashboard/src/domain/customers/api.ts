import type { PaginatedResponse } from '../shared/types';
import { requestData, requestEnvelope, requestOk } from '../../lib/http/api-client';

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  balance: number;
  priceTier?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  taxNumber: string;
}

export interface CustomerTransaction {
  id: string;
  customerId: string;
  type: 'DEBT' | 'PAYMENT';
  amount: number;
  description?: string | null;
  saleId?: string | null;
  createdAt: string;
}

export async function fetchCustomersApi(
  companyId: string,
  page = 1,
  search = '',
  limit = 50,
): Promise<PaginatedResponse<Customer>> {
  const envelope = await requestEnvelope<Customer[]>('/api/customers', {
    query: {
      companyId,
      limit: String(limit),
      page: String(page),
      search: search || undefined,
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

export async function createCustomerApi(
  companyId: string,
  payload: CustomerForm,
): Promise<Customer> {
  return requestData<Customer>('/api/customers', {
    body: { ...payload, companyId },
    method: 'POST',
  });
}

export async function updateCustomerApi(
  id: string,
  payload: Partial<CustomerForm>,
): Promise<Customer> {
  return requestData<Customer>(`/api/customers/${id}`, {
    body: payload,
    method: 'PUT',
  });
}

export async function deleteCustomerApi(id: string): Promise<void> {
  await requestOk(`/api/customers/${id}`, { method: 'DELETE' });
}

export async function fetchCustomerTransactionsApi(
  customerId: string,
): Promise<CustomerTransaction[]> {
  return requestData<CustomerTransaction[]>(`/api/customers/${customerId}/transactions`);
}

export async function createCustomerTransactionApi(
  customerId: string,
  payload: { type: 'DEBT' | 'PAYMENT'; amount: number; description?: string },
): Promise<void> {
  await requestOk(`/api/customers/${customerId}/transactions`, {
    body: payload,
    method: 'POST',
  });
}
