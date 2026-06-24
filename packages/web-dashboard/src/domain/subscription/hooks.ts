import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listProvisionTemplatesApi,
  listSubscriptionAuditApi,
  listSubscriptionCompaniesApi,
  provisionCompanyApi,
  quickRenewSubscriptionApi,
  saveSubscriptionPlanApi,
  suspendSubscriptionApi,
  unsuspendSubscriptionApi,
  generateLicenseKeyApi,
} from './api';
import { queryKeys } from '../../lib/query-keys';
import type { SubscriptionFilters } from './types';

export function useSubscriptionCompaniesQuery(filters: SubscriptionFilters, enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () => listSubscriptionCompaniesApi(filters),
    queryKey: queryKeys.subscriptionCompanies(filters),
    staleTime: 30_000,
  });
}

export function useSubscriptionAuditQuery(companyId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && companyId.length > 0,
    queryFn: () => listSubscriptionAuditApi(companyId),
    queryKey: queryKeys.subscriptionAudit(companyId),
    staleTime: 20_000,
  });
}

export function useProvisionTemplatesQuery(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: listProvisionTemplatesApi,
    queryKey: queryKeys.subscriptionTemplates,
    staleTime: 300_000,
  });
}

export function useSubscriptionMutations(filters: SubscriptionFilters, selectedCompanyId: string) {
  const queryClient = useQueryClient();
  const refreshSubscriptionScope = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.subscriptionCompanies(filters) });
    if (selectedCompanyId.length > 0) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptionAudit(selectedCompanyId),
      });
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.subscriptionTemplates });
  };

  const quickRenew = useMutation({
    mutationFn: quickRenewSubscriptionApi,
    onSuccess: refreshSubscriptionScope,
  });

  const suspend = useMutation({
    mutationFn: suspendSubscriptionApi,
    onSuccess: refreshSubscriptionScope,
  });

  const unsuspend = useMutation({
    mutationFn: unsuspendSubscriptionApi,
    onSuccess: refreshSubscriptionScope,
  });

  const savePlan = useMutation({
    mutationFn: saveSubscriptionPlanApi,
    onSuccess: refreshSubscriptionScope,
  });

  const provisionCompany = useMutation({
    mutationFn: provisionCompanyApi,
    onSuccess: refreshSubscriptionScope,
  });

  const generateLicense = useMutation({
    mutationFn: generateLicenseKeyApi,
    onSuccess: refreshSubscriptionScope,
  });

  return { provisionCompany, quickRenew, savePlan, suspend, unsuspend, generateLicense };
}
