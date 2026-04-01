import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createBranchApi,
  createCompanyApi,
  deleteBranchApi,
  deleteCompanyApi,
  listBranchesApi,
  listCompaniesApi,
  updateBranchApi,
  updateCompanyApi,
} from './api';
import { queryKeys } from '../../lib/query-keys';

export function useCompaniesQuery(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: listCompaniesApi,
    queryKey: queryKeys.companies,
    staleTime: 30_000,
  });
}

export function useBranchesQuery(companyId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && companyId.length > 0,
    queryFn: () => listBranchesApi(companyId),
    queryKey: queryKeys.branches(companyId),
    staleTime: 30_000,
  });
}

export function useCompanyMutations(companyId: string) {
  const queryClient = useQueryClient();

  const createCompany = useMutation({
    mutationFn: createCompanyApi,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies });
    },
  });

  const updateCompany = useMutation({
    mutationFn: (params: {
      address: string;
      email: string;
      isActive: boolean;
      name: string;
      phone: string;
      taxNumber: string;
    }) => updateCompanyApi(companyId, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies });
    },
  });

  const deleteCompany = useMutation({
    mutationFn: () => deleteCompanyApi(companyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies });
    },
  });

  return { createCompany, deleteCompany, updateCompany };
}

export function useBranchMutations(companyId: string, branchId: string) {
  const queryClient = useQueryClient();

  const invalidateCompanyScope = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.branches(companyId) });
  };

  const createBranch = useMutation({
    mutationFn: createBranchApi,
    onSuccess: invalidateCompanyScope,
  });

  const updateBranch = useMutation({
    mutationFn: (params: {
      address: string;
      isActive: boolean;
      name: string;
      phone: string;
    }) => updateBranchApi(branchId, params),
    onSuccess: invalidateCompanyScope,
  });

  const deleteBranch = useMutation({
    mutationFn: () => deleteBranchApi(branchId),
    onSuccess: invalidateCompanyScope,
  });

  return { createBranch, deleteBranch, updateBranch };
}
