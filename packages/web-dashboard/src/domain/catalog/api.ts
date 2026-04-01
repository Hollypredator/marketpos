import { requestData } from '../../lib/http/api-client';
import { intNum, num, toOptionalString } from '../../lib/format';
import type { Category, Product } from './types';

export async function listCategoriesApi(companyId: string): Promise<Category[]> {
  return requestData<Category[]>('/api/categories', {
    query: { companyId },
  });
}

export async function listProductsApi(companyId: string): Promise<Product[]> {
  return requestData<Product[]>('/api/products', {
    query: { companyId, limit: '200', page: '1' },
  });
}

export async function createCategoryApi(payload: {
  color: string;
  companyId: string;
  name: string;
  sortOrder: string;
}): Promise<Category> {
  return requestData<Category>('/api/categories', {
    body: {
      color: toOptionalString(payload.color),
      companyId: payload.companyId,
      name: payload.name.trim(),
      sortOrder: Math.max(0, intNum(payload.sortOrder, 0)),
    },
    method: 'POST',
  });
}

export async function createProductApi(payload: {
  barcode: string;
  categoryId: string;
  companyId: string;
  minStock: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
}): Promise<Product> {
  return requestData<Product>('/api/products', {
    body: {
      barcode: payload.barcode.trim(),
      categoryId: toOptionalString(payload.categoryId),
      companyId: payload.companyId,
      minStock: Math.max(0, intNum(payload.minStock, 0)),
      name: payload.name.trim(),
      purchasePrice: Math.max(0, num(payload.purchasePrice, 0)),
      salePrice: Math.max(0, num(payload.salePrice, 0)),
      vatRate: Math.round(num(payload.vatRate, 10)),
    },
    method: 'POST',
  });
}
