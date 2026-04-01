import { useMutation, useQuery } from '@tanstack/react-query';

import { loadOperationsHealthApi, loadReportsApi } from './api';
import { queryKeys } from '../../lib/query-keys';

export function useOperationsHealthQuery(params: {
  branchId: string;
  companyId: string;
  enabled: boolean;
  isSuperAdmin: boolean;
  role: string;
}) {
  return useQuery({
    enabled: params.enabled,
    queryFn: () =>
      loadOperationsHealthApi({
        branchId: params.branchId,
        companyId: params.companyId,
        isSuperAdmin: params.isSuperAdmin,
      }),
    queryKey: queryKeys.operationsHealth(params.role, params.companyId, params.branchId),
    staleTime: 20_000,
  });
}

export function useReportsMutation() {
  return useMutation({
    mutationFn: loadReportsApi,
  });
}
