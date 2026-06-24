import type { Category, Product } from '../shared/types';

export type { Category, Product };

export interface CategoryForm {
  color: string;
  name: string;
  parentId: string;
  sortOrder: string;
}

export interface ProductForm {
  barcode: string;
  brand: string;
  categoryId: string;
  supplierId: string;
  minStock: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
  expiryDate: string;
}

export interface ProductListFilters {
  active: '' | 'false' | 'true';
  brand: string;
  categoryId: string;
  maxPrice: string;
  maxPurchasePrice: string;
  minPrice: string;
  minPurchasePrice: string;
  search: string;
  supplierId: string;
  updatedFrom: string;
  updatedTo: string;
  vatRate: string;
}

export type BulkProductMode =
  | 'ADJUST_PRICE_PERCENT'
  | 'MOVE_CATEGORY'
  | 'SET_ACTIVE'
  | 'SET_MIN_STOCK'
  | 'SET_PRICE';

export interface BulkProductUpdateForm {
  mode: BulkProductMode;
  percentage: string;
  categoryId: string;
  isActive: 'false' | 'true';
  minStock: string;
  salePrice: string;
}

export interface BulkProductUpdateRow {
  changed: boolean;
  id: string;
  message?: string;
  next: {
    categoryId: string | null;
    isActive: boolean;
    minStock: number;
    salePrice: number;
  } | null;
  previous: {
    categoryId: string | null;
    isActive: boolean;
    minStock: number;
    salePrice: number;
  } | null;
  success: boolean;
}

export interface BulkProductUpdateResult {
  preview: {
    mode: BulkProductMode;
    sample: BulkProductUpdateRow[];
    totalRequested: number;
    totalResolved: number;
    willChange: number;
  };
  rows: BulkProductUpdateRow[];
  summary?: {
    failed: number;
    requested: number;
    updated: number;
  };
}
