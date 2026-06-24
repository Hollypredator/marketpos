import type { Register, StockLevel, StockMovement } from '../shared/types';

export type { Register, StockLevel, StockMovement };

export interface StockMovementForm {
  note: string;
  productId: string;
  quantity: string;
  reference: string;
  type: string;
}

export interface StockMovementListFilters {
  dateFrom: string;
  dateTo: string;
  maxQuantity: string;
  minQuantity: string;
  search: string;
  type: string;
  userSearch: string;
}
