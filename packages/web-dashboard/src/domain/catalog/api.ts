import { requestData, requestEnvelope, requestOk } from '../../lib/http/api-client';
import { intNum, num, toOptionalString } from '../../lib/format';
import type {
  BulkProductUpdateForm,
  BulkProductUpdateResult,
  Category,
  Product,
  ProductListFilters,
} from './types';

interface CategoryTreeNode extends Category {
  children?: CategoryTreeNode[];
}

function flattenCategoryTree(nodes: CategoryTreeNode[]): Category[] {
  const flat: Category[] = [];

  const visit = (node: CategoryTreeNode, parentId: string | null): void => {
    flat.push({
      color: node.color ?? null,
      id: node.id,
      name: node.name,
      parentId: node.parentId ?? parentId,
      sortOrder: node.sortOrder,
    });

    for (const child of node.children ?? []) {
      visit(child, node.id);
    }
  };

  for (const root of nodes) {
    visit(root, root.parentId ?? null);
  }

  return flat;
}

export async function listCategoriesApi(companyId: string): Promise<Category[]> {
  const data = await requestData<CategoryTreeNode[]>('/api/categories', {
    query: { companyId },
  });
  return flattenCategoryTree(data);
}

function toProductsQuery(companyId: string, filters: ProductListFilters): Record<string, string> {
  return {
    active: filters.active,
    brand: filters.brand,
    categoryId: filters.categoryId,
    companyId,
    includeInactive: 'true',
    maxPrice: filters.maxPrice,
    maxPurchasePrice: filters.maxPurchasePrice,
    minPrice: filters.minPrice,
    minPurchasePrice: filters.minPurchasePrice,
    search: filters.search,
    supplierId: filters.supplierId,
    updatedFrom: filters.updatedFrom,
    updatedTo: filters.updatedTo,
    vatRate: filters.vatRate,
  };
}

export async function listProductsApi(companyId: string, filters: ProductListFilters): Promise<Product[]> {
  const limit = '100';
  const firstPage = await requestEnvelope<Product[]>('/api/products', {
    query: { ...toProductsQuery(companyId, filters), limit, page: '1' },
  });

  const products: Product[] = [...(firstPage.data ?? [])];
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
        requestEnvelope<Product[]>('/api/products', {
          query: { ...toProductsQuery(companyId, filters), limit, page: String(page) },
        }),
      ),
    );
    for (const page of pages) {
      products.push(...(page.data ?? []));
    }
  }

  return products;
}

export async function createCategoryApi(payload: {
  color: string;
  companyId: string;
  name: string;
  parentId: string;
  sortOrder: string;
}): Promise<Category> {
  return requestData<Category>('/api/categories', {
    body: {
      color: toOptionalString(payload.color),
      companyId: payload.companyId,
      name: payload.name.trim(),
      parentId: toOptionalString(payload.parentId),
      sortOrder: Math.max(0, intNum(payload.sortOrder, 0)),
    },
    method: 'POST',
  });
}

export async function updateCategoryApi(payload: {
  color: string;
  id: string;
  name: string;
  parentId: string;
  sortOrder: string;
}): Promise<Category> {
  return requestData<Category>(`/api/categories/${payload.id}`, {
    body: {
      color: toOptionalString(payload.color),
      name: payload.name.trim(),
      parentId: toOptionalString(payload.parentId),
      sortOrder: Math.max(0, intNum(payload.sortOrder, 0)),
    },
    method: 'PUT',
  });
}

export async function deleteCategoryApi(payload: {
  id: string;
  transferCategoryId: string;
}): Promise<void> {
  await requestOk(`/api/categories/${payload.id}`, {
    body: { transferCategoryId: toOptionalString(payload.transferCategoryId) },
    method: 'DELETE',
  });
}

export async function createProductApi(payload: {
  barcode: string;
  brand: string;
  categoryId: string;
  companyId: string;
  supplierId: string;
  minStock: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
  expiryDate: string;
}): Promise<Product> {
  return requestData<Product>('/api/products', {
    body: {
      barcode: payload.barcode.trim(),
      brand: payload.brand.trim().length > 0 ? payload.brand.trim() : null,
      categoryId: payload.categoryId.trim().length > 0 ? payload.categoryId.trim() : null,
      companyId: payload.companyId,
      expiryDate: payload.expiryDate.trim().length ? new Date(payload.expiryDate).toISOString() : null,
      minStock: Math.max(0, intNum(payload.minStock, 0)),
      name: payload.name.trim(),
      purchasePrice: Math.max(0, num(payload.purchasePrice, 0)),
      salePrice: Math.max(0, num(payload.salePrice, 0)),
      supplierId: payload.supplierId.trim().length > 0 ? payload.supplierId.trim() : null,
      vatRate: Math.round(num(payload.vatRate, 10)),
    },
    method: 'POST',
  });
}

export async function updateProductApi(payload: {
  barcode: string;
  brand: string;
  categoryId: string;
  id: string;
  isActive: boolean;
  supplierId: string;
  minStock: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
  expiryDate: string;
}): Promise<Product> {
  return requestData<Product>(`/api/products/${payload.id}`, {
    body: {
      barcode: payload.barcode.trim(),
      brand: payload.brand.trim().length > 0 ? payload.brand.trim() : null,
      categoryId: payload.categoryId.trim().length > 0 ? payload.categoryId.trim() : null,
      expiryDate: payload.expiryDate.trim().length ? new Date(payload.expiryDate).toISOString() : null,
      isActive: payload.isActive,
      minStock: Math.max(0, intNum(payload.minStock, 0)),
      name: payload.name.trim(),
      purchasePrice: Math.max(0, num(payload.purchasePrice, 0)),
      salePrice: Math.max(0, num(payload.salePrice, 0)),
      supplierId: payload.supplierId.trim().length > 0 ? payload.supplierId.trim() : null,
      vatRate: Math.round(num(payload.vatRate, 10)),
    },
    method: 'PUT',
  });
}

export async function deleteProductApi(payload: { id: string }): Promise<void> {
  await requestOk(`/api/products/${payload.id}`, {
    method: 'DELETE',
  });
}

export async function bulkProductUpdateApi(payload: {
  companyId: string;
  form: BulkProductUpdateForm;
  previewOnly: boolean;
  productIds: string[];
}): Promise<BulkProductUpdateResult> {
  return requestData<BulkProductUpdateResult>('/api/products/bulk-update', {
    body: {
      categoryId:
        payload.form.mode === 'MOVE_CATEGORY'
          ? toOptionalString(payload.form.categoryId)
          : undefined,
      companyId: payload.companyId,
      isActive:
        payload.form.mode === 'SET_ACTIVE'
          ? payload.form.isActive === 'true'
          : undefined,
      minStock:
        payload.form.mode === 'SET_MIN_STOCK'
          ? Math.max(0, intNum(payload.form.minStock, 0))
          : undefined,
      mode: payload.form.mode,
      percentage:
        payload.form.mode === 'ADJUST_PRICE_PERCENT'
          ? num(payload.form.percentage, 0)
          : undefined,
      previewOnly: payload.previewOnly,
      productIds: payload.productIds,
      salePrice:
        payload.form.mode === 'SET_PRICE'
          ? Math.max(0, num(payload.form.salePrice, 0))
          : undefined,
    },
    method: 'POST',
  });
}

export async function setupDefaultCatalogApi(payload?: {
  companyId?: string;
}): Promise<{ totalSynced: number }> {
  return requestData<{ totalSynced: number }>('/api/products/setup-defaults', {
    body: payload,
    method: 'POST',
  });
}
