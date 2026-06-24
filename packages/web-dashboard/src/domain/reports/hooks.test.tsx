import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadOperationsHealthApi, loadReportsApi } from './api';
import { useOperationsHealthQuery, useReportsMutation } from './hooks';
import type { ReportsParams } from './types';

vi.mock('./api', () => ({
  loadOperationsHealthApi: vi.fn(),
  loadReportsApi: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('reports hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads operations health successfully', async () => {
    vi.mocked(loadOperationsHealthApi).mockResolvedValueOnce({
      branches: [],
      company: { id: 'company-1', name: 'Demo Company' },
      generatedAt: '2026-03-01T10:00:00.000Z',
      summary: {
        branchCount: 1,
        failedQueueTotal: 0,
        lastSyncAt: null,
        offlineRegisters: 0,
        onlineRegisters: 1,
        pendingQueueTotal: 0,
        registerCount: 1,
      },
    });

    const { result } = renderHook(
      () =>
        useOperationsHealthQuery({
          branchId: 'branch-1',
          companyId: 'company-1',
          enabled: true,
          isSuperAdmin: true,
          role: 'SUPER_ADMIN',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.company.name).toBe('Demo Company');
    expect(loadOperationsHealthApi).toHaveBeenCalledWith({
      branchId: 'branch-1',
      companyId: 'company-1',
      isSuperAdmin: true,
    });
  });

  it('returns error state for failed operations health request', async () => {
    vi.mocked(loadOperationsHealthApi).mockRejectedValueOnce(new Error('health failed'));

    const { result } = renderHook(
      () =>
        useOperationsHealthQuery({
          branchId: 'branch-1',
          companyId: 'company-1',
          enabled: true,
          isSuperAdmin: false,
          role: 'ADMIN',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect((result.current.error as Error).message).toBe('health failed');
  });

  it('runs reports mutation success and failure flows', async () => {
    const params: ReportsParams = {
      branchId: 'branch-1',
      companyId: 'company-1',
      dailyDate: '2026-03-01',
      from: '2026-03-01',
      registerId: '',
      to: '2026-03-31',
    };

    vi.mocked(loadReportsApi).mockResolvedValueOnce({
      branchComparisonRows: [],
      dailyReport: {
        date: '2026-03-01',
        netSales: 100,
        paymentBreakdown: [],
        refundsCount: 0,
        salesCount: 1,
        totalRefunds: 0,
        totalSales: 100,
        totalVat: 10,
      },
      expiringProducts: [],
      ledgerSummary: {
        openingBalance: 0,
        totalDebt: 0,
        totalPayment: 0,
        closingBalance: 0,
        dueAmount: 0,
        last30DaysPayments: 0,
        netChange: 0,
        from: '2026-03-01',
        to: '2026-03-31',
      },
      profitabilityReport: {
        summary: {
          margin: 20,
          totalCost: 80,
          totalProfit: 20,
          totalRevenue: 100,
        },
        topProducts: [],
      },
      sessions: [],
      topProducts: [],
    });

    const { result } = renderHook(() => useReportsMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const payload = await result.current.mutateAsync(params);
      expect(payload.dailyReport.totalSales).toBe(100);
    });

    vi.mocked(loadReportsApi).mockRejectedValueOnce(new Error('reports failed'));

    await expect(result.current.mutateAsync(params)).rejects.toThrow('reports failed');
  });
});
