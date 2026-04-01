import { requestData } from '../../lib/http/api-client';
import type {
  BranchComparisonRow,
  DailyReport,
  OperationsHealthResponse,
  ReportSession,
  ReportsParams,
  ReportsPayload,
  TopProduct,
} from './types';

export async function loadOperationsHealthApi(params: {
  branchId: string;
  companyId: string;
  isSuperAdmin: boolean;
}): Promise<OperationsHealthResponse> {
  const query: Record<string, string | undefined> = {
    branchId: params.branchId || undefined,
  };
  if (params.isSuperAdmin) {
    query.companyId = params.companyId;
  }
  return requestData<OperationsHealthResponse>('/api/reports/operations-health', { query });
}

export async function loadReportsApi(params: ReportsParams): Promise<ReportsPayload> {
  const queryCompanyId = params.companyId || undefined;
  const [dailyReport, topProducts, sessions, branchComparisonRows] = await Promise.all([
    requestData<DailyReport>('/api/reports/daily', {
      query: {
        branchId: params.branchId,
        companyId: queryCompanyId,
        date: params.dailyDate,
      },
    }),
    requestData<TopProduct[]>('/api/reports/top-products', {
      query: {
        branchId: params.branchId,
        companyId: queryCompanyId,
        from: params.from,
        limit: '20',
        to: params.to,
      },
    }),
    requestData<ReportSession[]>('/api/reports/sessions', {
      query: {
        companyId: queryCompanyId,
        from: params.from,
        registerId: params.registerId || undefined,
        to: params.to,
      },
    }),
    requestData<BranchComparisonRow[]>('/api/reports/branch-comparison', {
      query: {
        companyId: queryCompanyId,
        from: params.from,
        to: params.to,
      },
    }),
  ]);

  return {
    branchComparisonRows,
    dailyReport,
    sessions,
    topProducts,
  };
}
