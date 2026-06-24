import { requestData, requestEnvelope, requestOk } from '../../lib/http/api-client';
import { num, toOptionalString } from '../../lib/format';
import type { Register, StockLevel, StockMovement, StockMovementListFilters } from './types';

export async function listStockLevelsApi(branchId: string): Promise<StockLevel[]> {
  return requestData<StockLevel[]>('/api/stock/levels', {
    query: { branchId },
  });
}

function toMovementQuery(
  branchId: string,
  filters: StockMovementListFilters,
): Record<string, string> {
  return {
    branchId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    maxQuantity: filters.maxQuantity,
    minQuantity: filters.minQuantity,
    search: filters.search,
    type: filters.type,
    userSearch: filters.userSearch,
  };
}

export async function listStockMovementsApi(
  branchId: string,
  filters: StockMovementListFilters,
): Promise<StockMovement[]> {
  const limit = '100';
  const firstPage = await requestEnvelope<StockMovement[]>('/api/stock/movements', {
    query: { ...toMovementQuery(branchId, filters), limit, page: '1' },
  });

  const movements: StockMovement[] = [...(firstPage.data ?? [])];
  const totalPages = Math.max(1, firstPage.pagination?.totalPages ?? 1);

  const pageNumbers = Array.from(
    { length: Math.max(0, totalPages - 1) },
    (_, index) => index + 2,
  );
  const batchSize = 5;

  for (let index = 0; index < pageNumbers.length; index += batchSize) {
    const batch = pageNumbers.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map((page) =>
        requestEnvelope<StockMovement[]>('/api/stock/movements', {
          query: { ...toMovementQuery(branchId, filters), limit, page: String(page) },
        }),
      ),
    );
    for (const page of pages) {
      movements.push(...(page.data ?? []));
    }
  }

  return movements;
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
  type: string;
}): Promise<void> {
  await requestOk('/api/stock/movement', {
    body: {
      branchId: payload.branchId,
      note: toOptionalString(payload.note),
      productId: payload.productId,
      quantity: num(payload.quantity, 0),
      reference: toOptionalString(payload.reference),
      type: toOptionalString(payload.type),
    },
    method: 'POST',
  });
}
