import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createCategoryApi, createProductApi, listCategoriesApi, listProductsApi } from './api';
import { queryKeys } from '../../lib/query-keys';

export function useCategoriesQuery(companyId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && companyId.length > 0,
    queryFn: () => listCategoriesApi(companyId),
    queryKey: queryKeys.categories(companyId),
    staleTime: 30_000,
  });
}

export function useProductsQuery(companyId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && companyId.length > 0,
    queryFn: () => listProductsApi(companyId),
    queryKey: queryKeys.products(companyId),
    staleTime: 30_000,
  });
}

export function useCatalogMutations(companyId: string) {
  const queryClient = useQueryClient();

  const invalidateCatalog = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.categories(companyId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.products(companyId) });
  };

  const createCategory = useMutation({
    mutationFn: createCategoryApi,
    onSuccess: invalidateCatalog,
  });

  const createProduct = useMutation({
    mutationFn: createProductApi,
    onSuccess: invalidateCatalog,
  });

  return { createCategory, createProduct };
}
