import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStockTransferApi,
  fetchStockTransferByIdApi,
  fetchStockTransfersApi,
  updateStockTransferStatusApi,
  type CreateStockTransferPayload,
  type StockTransferListFilters,
} from './api';

export function useStockTransfersQuery(filters: StockTransferListFilters, enabled = true) {
  return useQuery({
    queryFn: () => fetchStockTransfersApi(filters),
    queryKey: ['stock-transfers', filters],
    enabled,
  });
}

export function useStockTransferDetailQuery(id: string) {
  return useQuery({
    queryFn: () => fetchStockTransferByIdApi(id),
    queryKey: ['stock-transfer-detail', id],
    enabled: Boolean(id),
  });
}

export function useStockTransferMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (payload: CreateStockTransferPayload) =>
      createStockTransferApi(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: (params: {
      id: string;
      status: 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
      note?: string;
    }) => updateStockTransferStatusApi(params.id, params.status, params.note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
    },
  });

  return { create, updateStatus };
}
