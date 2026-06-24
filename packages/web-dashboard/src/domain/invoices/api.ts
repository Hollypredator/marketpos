import type { PaginatedResponse } from '../shared/types';
import { requestData, requestEnvelope } from '../../lib/http/api-client';
import type { Supplier } from '../suppliers/api';

export interface PurchaseInvoiceItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  vatAmount: number;
  discount: number;
  lineTotal: number;
}

export interface PurchaseInvoice {
  id: string;
  branchId: string;
  supplierId: string;
  invoiceNumber: string;
  documentType: 'ORDER' | 'DISPATCH' | 'INVOICE';
  dispatchNumber?: string | null;
  documentDate?: string | null;
  dueDate?: string | null;
  subtotal: number;
  totalVat: number;
  totalDiscount: number;
  grandTotal: number;
  note: string | null;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  sourceDispatchId?: string | null;
  convertedToInvoiceId?: string | null;
  convertedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  items?: PurchaseInvoiceItem[];
}

export interface PurchaseInvoiceItemForm {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseInvoiceForm {
  supplierId: string;
  documentType: 'ORDER' | 'DISPATCH' | 'INVOICE';
  invoiceNo?: string;
  dispatchNo?: string;
  invoiceDate?: string;
  dueDate?: string;
  note?: string;
  items: PurchaseInvoiceItemForm[];
  taxTotal: number;
}

export interface ConvertDispatchToInvoicePayload {
  documentDate?: string | null;
  dueDate?: string | null;
  invoiceNumber?: string;
  note?: string;
}

export async function fetchInvoicesApi(
  branchId: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<PurchaseInvoice>> {
  const envelope = await requestEnvelope<PurchaseInvoice[]>('/api/purchase-invoices', {
    query: {
      branchId,
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

export async function createInvoiceApi(
  branchId: string,
  payload: PurchaseInvoiceForm,
): Promise<PurchaseInvoice> {
  const invoiceNumber =
    payload.invoiceNo && payload.invoiceNo.trim().length > 0
      ? payload.invoiceNo.trim()
      : `MANUAL-${Date.now()}`;

  const normalizedDocumentDate = payload.invoiceDate
    ? new Date(`${payload.invoiceDate}T00:00:00`).toISOString()
    : null;
  const normalizedDueDate = payload.dueDate
    ? new Date(`${payload.dueDate}T00:00:00`).toISOString()
    : payload.documentType === 'INVOICE' && payload.invoiceDate
      ? new Date(`${payload.invoiceDate}T00:00:00`).toISOString()
      : null;

  return requestData<PurchaseInvoice>('/api/purchase-invoices', {
    body: {
      branchId,
      documentDate: normalizedDocumentDate,
      documentType: payload.documentType,
      dispatchNumber:
        payload.documentType === 'DISPATCH' &&
        payload.dispatchNo &&
        payload.dispatchNo.trim().length > 0
          ? payload.dispatchNo.trim()
          : undefined,
      dueDate: normalizedDueDate,
      invoiceNumber,
      items: payload.items.map((item) => ({
        discount: 0,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: 10,
      })),
      note: payload.note?.trim() || undefined,
      supplierId: payload.supplierId,
      totalDiscount: 0,
    },
    method: 'POST',
  });
}

export async function fetchInvoiceByIdApi(id: string): Promise<PurchaseInvoice> {
  return requestData<PurchaseInvoice>(`/api/purchase-invoices/${id}`);
}

export async function convertDispatchToInvoiceApi(
  dispatchId: string,
  payload?: ConvertDispatchToInvoicePayload,
): Promise<PurchaseInvoice> {
  return requestData<PurchaseInvoice>(`/api/purchase-invoices/${dispatchId}/convert-to-invoice`, {
    body: payload ?? {},
    method: 'POST',
  });
}
