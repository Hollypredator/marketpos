import type { PaginatedResponse } from '../shared/types';
import { requestData, requestEnvelope, requestOk } from '../../lib/http/api-client';

export interface StockTransferItem {
  id: string;
  productId: string;
  quantity: number;
  product?: { name: string; barcode: string };
}

export interface StockTransfer {
  id: string;
  companyId: string;
  sourceBranchId: string;
  targetBranchId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  note?: string | null;
  createdAt: string;
  sourceBranch?: { name: string };
  targetBranch?: { name: string };
  createdBy?: { fullName: string };
  items: StockTransferItem[];
}

export interface StockTransferListFilters {
  companyId?: string;
  sourceBranchId?: string;
  targetBranchId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface CreateStockTransferPayload {
  sourceBranchId: string;
  targetBranchId: string;
  items: Array<{ productId: string; quantity: number }>;
  note?: string;
}

export async function fetchStockTransfersApi(
  filters: StockTransferListFilters,
): Promise<PaginatedResponse<StockTransfer>> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const envelope = await requestEnvelope<StockTransfer[]>('/api/stock-transfers', {
    query: {
      companyId: filters.companyId,
      sourceBranchId: filters.sourceBranchId,
      targetBranchId: filters.targetBranchId,
      status: filters.status,
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

export async function fetchStockTransferByIdApi(id: string): Promise<StockTransfer> {
  return requestData<StockTransfer>(`/api/stock-transfers/${id}`);
}

export async function createStockTransferApi(
  payload: CreateStockTransferPayload,
): Promise<StockTransfer> {
  return requestData<StockTransfer>('/api/stock-transfers', {
    body: payload,
    method: 'POST',
  });
}

export async function updateStockTransferStatusApi(
  id: string,
  status: 'ACCEPTED' | 'REJECTED' | 'CANCELLED',
  note?: string,
): Promise<void> {
  await requestOk(`/api/stock-transfers/${id}/status`, {
    body: { status, note },
    method: 'PUT',
  });
}
