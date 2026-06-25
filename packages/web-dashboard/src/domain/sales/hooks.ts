import { useQuery } from '@tanstack/react-query';
import {
  fetchRefundsApi,
  fetchSaleByIdApi,
  fetchSalesApi,
  type SalesListFilters,
} from './api';

export function useSalesQuery(filters: SalesListFilters, enabled = true) {
  return useQuery({
    queryFn: () => fetchSalesApi(filters),
    queryKey: ['sales', filters],
    enabled: enabled && Boolean(filters.branchId),
  });
}

export function useSaleDetailQuery(saleId: string) {
  return useQuery({
    queryFn: () => fetchSaleByIdApi(saleId),
    queryKey: ['sale-detail', saleId],
    enabled: Boolean(saleId),
  });
}

export function useRefundsQuery(saleId: string) {
  return useQuery({
    queryFn: () => fetchRefundsApi(saleId),
    queryKey: ['refunds', saleId],
    enabled: Boolean(saleId),
  });
}
