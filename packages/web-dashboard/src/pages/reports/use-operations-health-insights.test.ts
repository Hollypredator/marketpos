import { describe, expect, it } from 'vitest';

import type { OperationsHealthResponse } from '../../domain/shared/types';
import {
  buildRegisterHealthMatrix,
  computeReplayRate,
  isStaleHeartbeat,
} from './use-operations-health-insights';

const baseResponse: OperationsHealthResponse = {
  branches: [
    {
      failedQueueTotal: 0,
      id: 'branch-1',
      lastSyncAt: null,
      name: 'Merkez',
      offlineRegisters: 0,
      onlineRegisters: 1,
      pendingQueueTotal: 0,
      registers: [
        {
          failedQueueCount: 0,
          id: 'register-1',
          isOnline: true,
          lastSyncAt: null,
          name: 'Kasa 1',
          openSessionUpdatedAt: null,
          pendingQueueCount: 0,
        },
      ],
    },
  ],
  company: { id: 'company-1', name: 'Demo Company' },
  generatedAt: '2026-04-19T00:00:00.000Z',
  summary: {
    branchCount: 1,
    failedQueueTotal: 0,
    lastSyncAt: null,
    offlineRegisters: 0,
    onlineRegisters: 1,
    pendingQueueTotal: 0,
    registerCount: 1,
  },
};

describe('useOperationsHealthInsights helpers', () => {
  it('computes replay rate with safe zero handling', () => {
    expect(computeReplayRate(0, 0)).toBe(0);
    expect(computeReplayRate(3, 1)).toBe(25);
  });

  it('detects stale heartbeat correctly', () => {
    const nowTs = Date.parse('2026-04-19T10:10:00.000Z');
    expect(isStaleHeartbeat(null, nowTs)).toBe(true);
    expect(isStaleHeartbeat('2026-04-19T09:59:00.000Z', nowTs)).toBe(true);
    expect(isStaleHeartbeat('2026-04-19T10:05:30.000Z', nowTs)).toBe(false);
  });

  it('builds matrix with deterministic fallback values when new fields are absent', () => {
    const matrix = buildRegisterHealthMatrix({
      failedThreshold: 0,
      nowTs: Date.parse('2026-04-19T10:10:00.000Z'),
      operationsHealth: baseResponse,
      pendingThreshold: 20,
      syncLagThresholdMinutes: 20,
    });

    expect(matrix).toHaveLength(1);
    expect(matrix[0].queuePeak).toBe(0);
    expect(matrix[0].oldestPendingAgeSec).toBeNull();
    expect(matrix[0].lastSyncErrorCode).toBeNull();
    expect(matrix[0].accepted24h).toBe(0);
    expect(matrix[0].replayed24h).toBe(0);
    expect(matrix[0].failed24h).toBe(0);
    expect(matrix[0].severity).toBe('WARN');
    expect(matrix[0].reasons).toContain('STALE_HEARTBEAT');
  });

  it('marks register as CRITICAL when failed queue exceeds threshold', () => {
    const matrix = buildRegisterHealthMatrix({
      failedThreshold: 0,
      nowTs: Date.parse('2026-04-19T10:10:00.000Z'),
      operationsHealth: {
        ...baseResponse,
        branches: [
          {
            ...baseResponse.branches[0],
            registers: [
              {
                ...baseResponse.branches[0].registers[0],
                failedQueueCount: 2,
              },
            ],
          },
        ],
      },
      pendingThreshold: 20,
      syncLagThresholdMinutes: 20,
    });

    expect(matrix[0].severity).toBe('CRITICAL');
    expect(matrix[0].reasons).toContain('FAILED_QUEUE>0');
  });
});
