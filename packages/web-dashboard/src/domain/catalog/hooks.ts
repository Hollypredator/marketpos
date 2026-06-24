import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  bulkProductUpdateApi,
  createCategoryApi,
  createProductApi,
  deleteCategoryApi,
  deleteProductApi,
  listCategoriesApi,
  listProductsApi,
  setupDefaultCatalogApi,
  updateCategoryApi,
  updateProductApi,
} from './api';
import { queryKeys } from '../../lib/query-keys';
import type { BulkProductUpdateForm, ProductListFilters } from './types';

export function useCategoriesQuery(companyId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && companyId.length > 0,
    queryFn: () => listCategoriesApi(companyId),
    queryKey: queryKeys.categories(companyId),
    staleTime: 30_000,
  });
}

export function useProductsQuery(companyId: string, filters: ProductListFilters, enabled: boolean) {
  return useQuery({
    enabled: enabled && companyId.length > 0,
    queryFn: () => listProductsApi(companyId, filters),
    queryKey: queryKeys.products(companyId, filters),
    staleTime: 30_000,
  });
}

export function useCatalogMutations(companyId: string) {
  const queryClient = useQueryClient();

  const invalidateCatalog = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.categories(companyId) });
    void queryClient.invalidateQueries({ queryKey: ['products', companyId] });
  };

  const createCategory = useMutation({
    mutationFn: createCategoryApi,
    onSuccess: invalidateCatalog,
  });

  const createProduct = useMutation({
    mutationFn: createProductApi,
    onSuccess: invalidateCatalog,
  });

  const updateCategory = useMutation({
    mutationFn: updateCategoryApi,
    onSuccess: invalidateCatalog,
  });

  const deleteCategory = useMutation({
    mutationFn: deleteCategoryApi,
    onSuccess: invalidateCatalog,
  });

  const updateProduct = useMutation({
    mutationFn: updateProductApi,
    onSuccess: invalidateCatalog,
  });

  const deleteProduct = useMutation({
    mutationFn: deleteProductApi,
    onSuccess: invalidateCatalog,
  });

  const bulkProductUpdate = useMutation({
    mutationFn: (data: {
      companyId: string;
      form: BulkProductUpdateForm;
      previewOnly: boolean;
      productIds: string[];
    }) => bulkProductUpdateApi(data),
    onSuccess: (result, variables) => {
      if (!variables.previewOnly) {
        invalidateCatalog();
      }
      return result;
    },
  });

  const setupDefaults = useMutation({
    mutationFn: (data: { companyId: string }) => setupDefaultCatalogApi(data),
    onSuccess: invalidateCatalog,
  });

  return {
    bulkProductUpdate,
    createCategory,
    createProduct,
    deleteCategory,
    deleteProduct,
    setupDefaults,
    updateCategory,
    updateProduct,
  };
}
