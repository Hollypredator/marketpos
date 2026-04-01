import { requestData, requestOk } from '../../lib/http/api-client';
import { num, toOptionalString } from '../../lib/format';
import type { Register, StockLevel, StockMovement } from './types';

export async function listStockLevelsApi(branchId: string): Promise<StockLevel[]> {
  return requestData<StockLevel[]>('/api/stock/levels', {
    query: { branchId },
  });
}

export async function listStockMovementsApi(branchId: string): Promise<StockMovement[]> {
  return requestData<StockMovement[]>('/api/stock/movements', {
    query: { branchId, limit: '50', page: '1' },
  });
}

export async function listRegistersApi(branchId: string): Promise<Register[]> {
  return requestData<Register[]>('/api/registers', {
    query: { branchId },
  });
}

export async function createStockMovementApi(payload: {
  branchId: string;
  note: string;
  productId: string;
  quantity: string;
  reference: string;
}): Promise<void> {
  await requestOk('/api/stock/movement', {
    body: {
      branchId: payload.branchId,
      note: toOptionalString(payload.note),
      productId: payload.productId,
      quantity: num(payload.quantity, 0),
      reference: toOptionalString(payload.reference),
    },
    method: 'POST',
  });
}
