import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadOperationsHealthApi, loadReportsApi } from './api';
import { requestData } from '../../lib/http/api-client';

vi.mock('../../lib/http/api-client', () => ({
  requestData: vi.fn(),
}));

describe('reports api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes companyId only for super admin in operations health query', async () => {
    vi.mocked(requestData).mockResolvedValueOnce({
      branches: [],
      company: { id: 'company-1', name: 'Demo Company' },
      generatedAt: '2026-04-03T00:00:00.000Z',
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

    await loadOperationsHealthApi({
      branchId: 'branch-1',
      companyId: 'company-1',
      isSuperAdmin: true,
    });

    expect(requestData).toHaveBeenCalledWith('/api/reports/operations-health', {
      query: {
        branchId: 'branch-1',
        companyId: 'company-1',
      },
    });
  });

  it('loads reports using bounded session payload query', async () => {
    vi.mocked(requestData)
      .mockResolvedValueOnce({
        date: '2026-04-03',
        netSales: 120,
        paymentBreakdown: [],
        refundsCount: 1,
        salesCount: 3,
        totalRefunds: 10,
        totalSales: 130,
        totalVat: 18,
      })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await loadReportsApi({
      branchId: 'branch-1',
      companyId: 'company-1',
      dailyDate: '2026-04-03',
      from: '2026-04-01',
      registerId: 'register-1',
      sessionLimit: 300,
      to: '2026-04-03',
    });

    expect(requestData).toHaveBeenNthCalledWith(3, '/api/reports/sessions', {
      query: {
        companyId: 'company-1',
        from: '2026-04-01',
        limit: '300',
        page: '1',
        registerId: 'register-1',
        to: '2026-04-03',
      },
    });
  });
});
