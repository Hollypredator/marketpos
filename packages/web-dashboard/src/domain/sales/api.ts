import type { PaginatedResponse } from '../shared/types';
import { requestData, requestEnvelope } from '../../lib/http/api-client';

export interface SalePayment {
  id: string;
  method: string;
  amount: number;
  reference?: string | null;
}

export interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  vatRate: number;
  vatAmount: number;
}

export interface Sale {
  id: string;
  receiptNumber: string;
  grandTotal: number;
  subtotal: number;
  totalVat: number;
  totalDiscount: number;
  totalCartDiscount?: number;
  status?: string;
  note?: string | null;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  user?: { fullName: string } | null;
  branch?: { name: string } | null;
  register?: { name: string } | null;
  items: SaleItem[];
  payments: SalePayment[];
}

export interface RefundItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  vatRate: number;
  vatAmount: number;
}

export interface Refund {
  id: string;
  receiptNumber: string;
  totalAmount: number;
  reason?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
  items: RefundItem[];
}

export interface SalesListFilters {
  branchId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function fetchSalesApi(
  filters: SalesListFilters,
): Promise<PaginatedResponse<Sale>> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const envelope = await requestEnvelope<Sale[]>('/api/sales', {
    query: {
      branchId: filters.branchId,
      from: filters.from,
      to: filters.to,
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

export async function fetchSaleByIdApi(id: string): Promise<Sale> {
  return requestData<Sale>(`/api/sales/${id}`);
}

export async function fetchSaleByReceiptApi(receiptNumber: string): Promise<Sale> {
  return requestData<Sale>(`/api/sales/receipt/${encodeURIComponent(receiptNumber)}`);
}

export async function fetchRefundsApi(saleId?: string): Promise<Refund[]> {
  return requestData<Refund[]>('/api/refunds', {
    query: { saleId },
  });
}
