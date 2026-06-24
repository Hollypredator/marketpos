import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createStockMovementApi,
  listRegistersApi,
  listStockLevelsApi,
  listStockMovementsApi,
} from './api';
import { queryKeys } from '../../lib/query-keys';
import type { StockMovementListFilters } from './types';

export function useStockLevelsQuery(branchId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && branchId.length > 0,
    queryFn: () => listStockLevelsApi(branchId),
    queryKey: queryKeys.stockLevels(branchId),
    staleTime: 20_000,
  });
}

export function useStockMovementsQuery(
  branchId: string,
  filters: StockMovementListFilters,
  enabled: boolean,
) {
  return useQuery({
    enabled: enabled && branchId.length > 0,
    queryFn: () => listStockMovementsApi(branchId, filters),
    queryKey: queryKeys.stockMovements(branchId, filters),
    staleTime: 20_000,
  });
}

export function useRegistersQuery(branchId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && branchId.length > 0,
    queryFn: () => listRegistersApi(branchId),
    queryKey: queryKeys.registers(branchId),
    staleTime: 20_000,
  });
}

export function useStockMutations(branchId: string) {
  const queryClient = useQueryClient();
  const invalidateBranchStock = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.stockLevels(branchId) });
    void queryClient.invalidateQueries({ queryKey: ['stock-movements', branchId] });
  };

  const createStockMovement = useMutation({
    mutationFn: createStockMovementApi,
    onSuccess: invalidateBranchStock,
  });

  return { createStockMovement };
}
