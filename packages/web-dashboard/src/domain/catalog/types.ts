import type { Category, Product } from '../shared/types';

export type { Category, Product };

export interface CategoryForm {
  color: string;
  name: string;
  sortOrder: string;
}

export interface ProductForm {
  barcode: string;
  categoryId: string;
  minStock: string;
  name: string;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
}
