import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  convertDispatchToInvoiceApi,
  createInvoiceApi,
  fetchInvoiceByIdApi,
  fetchInvoicesApi,
  type ConvertDispatchToInvoicePayload,
  type PurchaseInvoiceForm,
} from './api';

export function useInvoicesQuery(branchId: string, page = 1) {
  return useQuery({
    queryFn: () => fetchInvoicesApi(branchId, page, 50),
    queryKey: ['invoices', branchId, page],
    enabled: Boolean(branchId),
  });
}

export function useInvoiceDetailQuery(invoiceId?: string) {
  return useQuery({
    queryFn: () => fetchInvoiceByIdApi(invoiceId!),
    queryKey: ['invoices', 'detail', invoiceId],
    enabled: Boolean(invoiceId),
  });
}

export function useInvoiceMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (params: { branchId: string; payload: PurchaseInvoiceForm }) =>
      createInvoiceApi(params.branchId, params.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const convert = useMutation({
    mutationFn: (params: { dispatchId: string; payload?: ConvertDispatchToInvoicePayload }) =>
      convertDispatchToInvoiceApi(params.dispatchId, params.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  return {
    convertDispatchToInvoice: convert.mutateAsync,
    createInvoice: create.mutateAsync,
    isConverting: convert.isPending,
    isCreating: create.isPending,
  };
}
