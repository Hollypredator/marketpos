import { describe, expect, it } from 'vitest';

import type { CachedCategoryRecord, CachedProductRecord } from '../electron-api';
import type { StockLevelRow } from '../services/types';
import {
  buildCategoryNameById,
  buildCountRows,
  buildProductListRows,
  buildStockListRows,
  buildStockRowByProductId,
  classifyStockHealth,
  filterCountRows,
  normalizeDecimalInput,
  normalizeIntegerInput,
  normalizeVatRateInput,
  paginateItems,
  summarizeCountRows,
} from './stock-page-helpers';

const categories: CachedCategoryRecord[] = [
  {
    color: null,
    companyId: 'cmp-1',
    id: 'cat-drink',
    name: 'Icecek',
    parentId: null,
    sortOrder: 0,
  },
  {
    color: null,
    companyId: 'cmp-1',
    id: 'cat-snack',
    name: 'Atistirmalik',
    parentId: null,
    sortOrder: 1,
  },
];

const products: CachedProductRecord[] = [
  {
    barcode: '100',
    categoryId: 'cat-drink',
    companyId: 'cmp-1',
    id: 'prd-cola',
    isActive: true,
    isQuickAccess: true,
    name: 'Kola',
    purchasePrice: 20,
    quickAccessColor: null,
    quickAccessOrder: 1,
    salePrice: 25,
    stockLevel: 8,
    estimatedStock: 8,
    vatRate: 10,
  },
  {
    barcode: '200',
    categoryId: 'cat-snack',
    companyId: 'cmp-1',
    id: 'prd-cips',
    isActive: true,
    isQuickAccess: false,
    name: 'Cips',
    purchasePrice: 24,
    quickAccessColor: null,
    quickAccessOrder: null,
    salePrice: 30,
    stockLevel: 2,
    estimatedStock: 2,
    vatRate: 10,
  },
  {
    barcode: '300',
    categoryId: null,
    companyId: 'cmp-1',
    id: 'prd-sut',
    isActive: true,
    isQuickAccess: true,
    name: 'Sut',
    purchasePrice: 32,
    quickAccessColor: null,
    quickAccessOrder: 3,
    salePrice: 40,
    stockLevel: 0,
    estimatedStock: 0,
    vatRate: 1,
  },
];

const stockRows: StockLevelRow[] = [
  {
    branchId: 'br-1',
    id: 'sl-1',
    product: {
      barcode: '100',
      id: 'prd-cola',
      isActive: true,
      minStock: 5,
      name: 'Kola',
      salePrice: 25,
    },
    productId: 'prd-cola',
    quantity: 8,
    updatedAt: '2026-04-14T08:00:00.000Z',
  },
  {
    branchId: 'br-1',
    id: 'sl-2',
    product: {
      barcode: '200',
      id: 'prd-cips',
      isActive: true,
      minStock: 5,
      name: 'Cips',
      salePrice: 30,
    },
    productId: 'prd-cips',
    quantity: 2,
    updatedAt: '2026-04-14T08:00:00.000Z',
  },
  {
    branchId: 'br-1',
    id: 'sl-3',
    product: {
      barcode: '300',
      id: 'prd-sut',
      isActive: true,
      minStock: 4,
      name: 'Sut',
      salePrice: 40,
    },
    productId: 'prd-sut',
    quantity: 0,
    updatedAt: '2026-04-14T08:00:00.000Z',
  },
];

describe('stock-page-helpers', () => {
  it('classifies stock health correctly', () => {
    expect(classifyStockHealth(0, 5)).toBe('OUT_OF_STOCK');
    expect(classifyStockHealth(2, 5)).toBe('LOW_STOCK');
    expect(classifyStockHealth(10, 5)).toBe('OK');
  });

  it('applies product filters together (query + category + quick + critical)', () => {
    const categoryNameById = buildCategoryNameById(categories);
    const stockRowByProductId = buildStockRowByProductId(stockRows);

    const rows = buildProductListRows({
      categoryNameById,
      filters: {
        categoryId: 'cat-snack',
        criticalOnly: true,
        query: 'ci',
        quickAccessOnly: false,
      },
      products,
      stockRowByProductId,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.product.id).toBe('prd-cips');
    expect(rows[0]?.status).toBe('LOW_STOCK');

    const quickCriticalRows = buildProductListRows({
      categoryNameById,
      filters: {
        categoryId: '',
        criticalOnly: true,
        query: '',
        quickAccessOnly: true,
      },
      products,
      stockRowByProductId,
    });

    expect(quickCriticalRows.map((row) => row.product.id)).toEqual(['prd-sut']);
  });

  it('filters and sorts stock rows', () => {
    const criticalRows = buildStockListRows({
      filters: { query: '', scope: 'CRITICAL' },
      rows: stockRows,
      sort: 'QUANTITY_ASC',
    });

    expect(criticalRows.map((row) => row.row.product.id)).toEqual(['prd-sut', 'prd-cips']);

    const outRows = buildStockListRows({
      filters: { query: 'su', scope: 'OUT_OF_STOCK' },
      rows: stockRows,
      sort: 'NAME_ASC',
    });

    expect(outRows).toHaveLength(1);
    expect(outRows[0]?.row.product.id).toBe('prd-sut');
  });

  it('normalizes page to the last valid page', () => {
    const list = Array.from({ length: 23 }, (_, index) => index + 1);
    const result = paginateItems(list, 5, 10);

    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(3);
    expect(result.items).toEqual([21, 22, 23]);
  });

  it('builds and summarizes count rows with changed-only mode', () => {
    const countRows = buildCountRows(
      {
        'prd-cips': 2,
        'prd-cola': 10,
        'prd-sut': 0,
      },
      stockRows,
    );

    expect(countRows).toHaveLength(3);

    const changedRows = filterCountRows(countRows, true);
    expect(changedRows).toHaveLength(1);
    expect(changedRows[0]?.stock.product.id).toBe('prd-cola');

    const summary = summarizeCountRows(countRows);
    expect(summary.changedCount).toBe(1);
    expect(summary.totalPositiveDelta).toBe(2);
    expect(summary.totalNegativeDelta).toBe(0);
  });

  it('normalizes numeric and vat inputs', () => {
    expect(normalizeDecimalInput('-2.777', 0, 2)).toBe('0.00');
    expect(normalizeDecimalInput('3,456', 0, 2)).toBe('3.46');
    expect(normalizeIntegerInput('-6', 0)).toBe('0');
    expect(normalizeIntegerInput('abc', 3)).toBe('3');
    expect(normalizeVatRateInput('20', [1, 10, 20], 10)).toBe('20');
    expect(normalizeVatRateInput('15', [1, 10, 20], 10)).toBe('10');
  });
});
