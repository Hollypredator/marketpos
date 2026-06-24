import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSupplierTransactionApi,
  createSupplierApi,
  deleteSupplierApi,
  fetchSupplierTransactionsApi,
  fetchSuppliersApi,
  updateSupplierApi,
  type SupplierTransactionFilters,
  type SupplierForm,
} from './api';

export function useSuppliersQuery(companyId: string, page = 1) {
  return useQuery({
    queryFn: () => fetchSuppliersApi(companyId, page, 50),
    queryKey: ['suppliers', companyId, page],
    enabled: Boolean(companyId),
  });
}

export function useSupplierTransactionsQuery(
  supplierId: string,
  filters?: SupplierTransactionFilters,
) {
  return useQuery({
    queryFn: () => fetchSupplierTransactionsApi(supplierId, filters),
    queryKey: ['supplier-transactions', supplierId, filters],
    enabled: Boolean(supplierId),
  });
}

export function useSupplierMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (params: { companyId: string; payload: SupplierForm }) =>
      createSupplierApi(params.companyId, params.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  const update = useMutation({
    mutationFn: (params: { id: string; payload: Partial<SupplierForm> }) =>
      updateSupplierApi(params.id, params.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSupplierApi(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  const createTransaction = useMutation({
    mutationFn: (params: {
      supplierId: string;
      payload: {
        type: 'DEBT' | 'PAYMENT';
        amount: number;
        description?: string;
        invoiceId?: string;
      };
    }) => createSupplierTransactionApi(params.supplierId, params.payload),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      void queryClient.invalidateQueries({
        queryKey: ['supplier-transactions', variables.supplierId],
        exact: false,
      });
    },
  });

  return {
    createSupplierTransaction: createTransaction.mutateAsync,
    createSupplier: create.mutateAsync,
    deleteSupplier: remove.mutateAsync,
    isCreating: create.isPending,
    isCreatingTransaction: createTransaction.isPending,
    isDeleting: remove.isPending,
    isUpdating: update.isPending,
    updateSupplier: update.mutateAsync,
  };
}
