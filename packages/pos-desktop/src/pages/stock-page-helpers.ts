import type { CachedCategoryRecord, CachedProductRecord } from '../electron-api';
import type { StockLevelRow } from '../services/types';

export type StockHealthStatus = 'LOW_STOCK' | 'OK' | 'OUT_OF_STOCK';

export interface ProductListFilters {
  categoryId: string;
  criticalOnly: boolean;
  query: string;
  quickAccessOnly: boolean;
}

export interface ProductListRow {
  categoryName: string;
  currentQuantity: number;
  minStock: number;
  product: CachedProductRecord;
  status: StockHealthStatus;
}

export type StockScope = 'ALL' | 'CRITICAL' | 'OUT_OF_STOCK';
export type StockSort = 'NAME_ASC' | 'QUANTITY_ASC' | 'QUANTITY_DESC';

export interface StockListFilters {
  query: string;
  scope: StockScope;
}

export interface StockListRow {
  row: StockLevelRow;
  status: StockHealthStatus;
}

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StockSummary {
  lowStockCount: number;
  outOfStockCount: number;
  total: number;
}

export interface CountRow {
  counted: number;
  delta: number;
  stock: StockLevelRow;
}

export interface CountSummary {
  changedCount: number;
  totalNegativeDelta: number;
  totalPositiveDelta: number;
}

const STOCK_EPSILON = 0.0001;

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function compareNameTr(left: string, right: string): number {
  return left.localeCompare(right, 'tr');
}

export function classifyStockHealth(quantity: number, minStock: number): StockHealthStatus {
  const safeQuantity = Number.isFinite(quantity) ? quantity : 0;
  const safeMinStock = Number.isFinite(minStock) ? Math.max(0, minStock) : 0;

  if (safeQuantity <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (safeQuantity <= safeMinStock) {
    return 'LOW_STOCK';
  }
  return 'OK';
}

export function buildCategoryNameById(
  categories: CachedCategoryRecord[],
): Map<string, string> {
  return new Map(categories.map((category) => [category.id, category.name]));
}

export function buildStockRowByProductId(rows: StockLevelRow[]): Map<string, StockLevelRow> {
  return new Map(rows.map((row) => [row.product.id, row]));
}

export function buildProductListRows(params: {
  categoryNameById: Map<string, string>;
  filters: ProductListFilters;
  products: CachedProductRecord[];
  stockRowByProductId: Map<string, StockLevelRow>;
}): ProductListRow[] {
  const keyword = normalizeSearch(params.filters.query);

  return [...params.products]
    .sort((left, right) => compareNameTr(left.name, right.name))
    .map((product) => {
      const stockRow = params.stockRowByProductId.get(product.id) ?? null;
      const currentQuantity = stockRow?.quantity ?? 0;
      const minStock = stockRow?.product.minStock ?? 0;
      const status = classifyStockHealth(currentQuantity, minStock);
      const categoryName =
        (product.categoryId && params.categoryNameById.get(product.categoryId)) ?? '-';

      return {
        categoryName,
        currentQuantity,
        minStock,
        product,
        status,
      };
    })
    .filter((entry) => {
      if (params.filters.categoryId.length > 0 && entry.product.categoryId !== params.filters.categoryId) {
        return false;
      }
      if (params.filters.quickAccessOnly && !entry.product.isQuickAccess) {
        return false;
      }
      if (params.filters.criticalOnly && entry.status === 'OK') {
        return false;
      }
      if (keyword.length === 0) {
        return true;
      }

      const haystack = `${entry.product.name} ${entry.product.barcode} ${entry.categoryName}`.toLocaleLowerCase('tr-TR');
      return haystack.includes(keyword);
    });
}

export function buildStockListRows(params: {
  filters: StockListFilters;
  rows: StockLevelRow[];
  sort: StockSort;
}): StockListRow[] {
  const keyword = normalizeSearch(params.filters.query);

  const filtered = params.rows
    .map((row) => ({
      row,
      status: classifyStockHealth(row.quantity, row.product.minStock),
    }))
    .filter((entry) => {
      if (params.filters.scope === 'OUT_OF_STOCK' && entry.status !== 'OUT_OF_STOCK') {
        return false;
      }
      if (params.filters.scope === 'CRITICAL' && entry.status === 'OK') {
        return false;
      }
      if (keyword.length === 0) {
        return true;
      }
      const haystack = `${entry.row.product.name} ${entry.row.product.barcode}`.toLocaleLowerCase('tr-TR');
      return haystack.includes(keyword);
    });

  return filtered.sort((left, right) => {
    if (params.sort === 'QUANTITY_ASC') {
      return left.row.quantity - right.row.quantity;
    }
    if (params.sort === 'QUANTITY_DESC') {
      return right.row.quantity - left.row.quantity;
    }
    return compareNameTr(left.row.product.name, right.row.product.name);
  });
}

export function summarizeStockRows(rows: StockLevelRow[]): StockSummary {
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const row of rows) {
    const status = classifyStockHealth(row.quantity, row.product.minStock);
    if (status === 'LOW_STOCK') {
      lowStockCount += 1;
    } else if (status === 'OUT_OF_STOCK') {
      outOfStockCount += 1;
    }
  }

  return {
    lowStockCount,
    outOfStockCount,
    total: rows.length,
  };
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginationResult<T> {
  const total = items.length;
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);
  const start = (normalizedPage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    page: normalizedPage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}

export function buildCountRows(
  countMap: Record<string, number>,
  stockRows: StockLevelRow[],
): CountRow[] {
  return Object.entries(countMap)
    .map(([productId, counted]) => {
      const stock = stockRows.find((candidate) => candidate.product.id === productId);
      if (!stock) {
        return null;
      }
      return {
        counted,
        delta: counted - stock.quantity,
        stock,
      };
    })
    .filter((row): row is CountRow => row !== null)
    .sort((left, right) => compareNameTr(left.stock.product.name, right.stock.product.name));
}

export function filterCountRows(rows: CountRow[], onlyChanged: boolean): CountRow[] {
  if (!onlyChanged) {
    return rows;
  }
  return rows.filter((row) => Math.abs(row.delta) > STOCK_EPSILON);
}

export function summarizeCountRows(rows: CountRow[]): CountSummary {
  let changedCount = 0;
  let totalPositiveDelta = 0;
  let totalNegativeDelta = 0;

  for (const row of rows) {
    if (Math.abs(row.delta) <= STOCK_EPSILON) {
      continue;
    }
    changedCount += 1;
    if (row.delta > 0) {
      totalPositiveDelta += row.delta;
    } else {
      totalNegativeDelta += row.delta;
    }
  }

  return {
    changedCount,
    totalNegativeDelta,
    totalPositiveDelta,
  };
}

export function normalizeDecimalInput(value: string, fallback: number, fractionDigits = 2): string {
  const normalizedValue = value.trim().replace(',', '.');
  const parsed = Number.parseFloat(normalizedValue);
  if (!Number.isFinite(parsed)) {
    return fallback.toFixed(fractionDigits);
  }
  return Math.max(0, parsed).toFixed(fractionDigits);
}

export function normalizeIntegerInput(value: string, fallback: number): string {
  const normalizedValue = value.trim();
  const parsed = Number.parseInt(normalizedValue, 10);
  if (!Number.isFinite(parsed)) {
    return String(Math.max(0, Math.round(fallback)));
  }
  return String(Math.max(0, parsed));
}

export function normalizeVatRateInput(
  value: string,
  vatRates: readonly number[],
  fallback: number,
): string {
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));
  if (Number.isFinite(parsed) && vatRates.includes(parsed)) {
    return String(parsed);
  }
  if (vatRates.includes(fallback)) {
    return String(fallback);
  }
  return String(vatRates[0] ?? fallback);
}
