import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCustomerApi,
  createCustomerTransactionApi,
  deleteCustomerApi,
  fetchCustomersApi,
  fetchCustomerTransactionsApi,
  updateCustomerApi,
  type CustomerForm,
} from './api';

export function useCustomersQuery(companyId: string, page = 1, search = '') {
  return useQuery({
    queryFn: () => fetchCustomersApi(companyId, page, search),
    queryKey: ['customers', companyId, page, search],
    enabled: Boolean(companyId),
  });
}

export function useCustomerTransactionsQuery(customerId: string) {
  return useQuery({
    queryFn: () => fetchCustomerTransactionsApi(customerId),
    queryKey: ['customer-transactions', customerId],
    enabled: Boolean(customerId),
  });
}

export function useCustomerMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (params: { companyId: string; payload: CustomerForm }) =>
      createCustomerApi(params.companyId, params.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const update = useMutation({
    mutationFn: (params: { id: string; payload: Partial<CustomerForm> }) =>
      updateCustomerApi(params.id, params.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCustomerApi(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const createTransaction = useMutation({
    mutationFn: (params: {
      customerId: string;
      payload: { type: 'DEBT' | 'PAYMENT'; amount: number; description?: string };
    }) => createCustomerTransactionApi(params.customerId, params.payload),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({
        queryKey: ['customer-transactions', variables.customerId],
      });
    },
  });

  return {
    create,
    update,
    remove,
    createTransaction,
  };
}
