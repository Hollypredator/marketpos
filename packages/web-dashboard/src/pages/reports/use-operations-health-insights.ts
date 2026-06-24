import React from 'react';

import type { OperationsHealthResponse } from '../../domain/shared/types';

const SLA_PENDING_KEY = 'marketpos.reports.sla.maxPendingQueue';
const SLA_FAILED_KEY = 'marketpos.reports.sla.maxFailedQueue';
const SLA_SYNC_LAG_KEY = 'marketpos.reports.sla.maxSyncLagMinutes';

export interface RegisterHealthMatrixRow {
  accepted24h: number;
  branchName: string;
  degraded: boolean;
  failed24h: number;
  failedQueueCount: number;
  isOnline: boolean;
  lastHeartbeatAt: string | null;
  lastSyncAt: string | null;
  lastSyncErrorCode: string | null;
  lastSyncStatus: string;
  oldestPendingAgeSec: number | null;
  pendingQueueCount: number;
  queuePeak: number;
  reasons: string;
  registerId: string;
  registerName: string;
  replayRate24h: number;
  replayed24h: number;
  severity: 'CRITICAL' | 'OK' | 'WARN';
  staleHeartbeat: boolean;
  syncLagMinutes: number | null;
}

export interface OperationsHealthInsights {
  hasOpsQueuePressure: boolean;
  hasOpsRisk: boolean;
  matrixSummary: {
    critical: number;
    ok: number;
    warn: number;
  };
  registerHealthMatrix: RegisterHealthMatrixRow[];
  safeFailedThreshold: number;
  safePendingThreshold: number;
  safeSyncLagThresholdMinutes: number;
  setSlaMaxFailedQueue: React.Dispatch<React.SetStateAction<string>>;
  setSlaMaxPendingQueue: React.Dispatch<React.SetStateAction<string>>;
  setSlaMaxSyncLagMinutes: React.Dispatch<React.SetStateAction<string>>;
  slaMaxFailedQueue: string;
  slaMaxPendingQueue: string;
  slaMaxSyncLagMinutes: string;
}

export function computeReplayRate(acceptedCount: number, replayedCount: number): number {
  const denominator = acceptedCount + replayedCount;
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((replayedCount / denominator) * 10000) / 100;
}

export function isStaleHeartbeat(
  lastHeartbeatAt: string | null | undefined,
  nowTs: number,
  thresholdMinutes = 10,
): boolean {
  if (!lastHeartbeatAt) {
    return true;
  }
  const heartbeatTs = new Date(lastHeartbeatAt).getTime();
  if (!Number.isFinite(heartbeatTs)) {
    return true;
  }
  return nowTs - heartbeatTs > thresholdMinutes * 60 * 1000;
}

function normalizeIntegerThreshold(raw: string, fallback: number, min: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, parsed);
}

export function buildRegisterHealthMatrix(params: {
  failedThreshold: number;
  nowTs: number;
  operationsHealth: OperationsHealthResponse;
  pendingThreshold: number;
  syncLagThresholdMinutes: number;
}): RegisterHealthMatrixRow[] {
  return params.operationsHealth.branches.flatMap((branch) =>
    branch.registers.map((register) => {
      const reasons: string[] = [];
      let severity: 'CRITICAL' | 'OK' | 'WARN' = 'OK';

      const syncLagMinutes = register.lastSyncAt
        ? Math.round((params.nowTs - new Date(register.lastSyncAt).getTime()) / 60000)
        : null;

      const staleHeartbeat = isStaleHeartbeat(register.lastHeartbeatAt ?? null, params.nowTs);
      const queuePeak = register.queuePeak ?? 0;
      const oldestPendingAgeSec = register.oldestPendingAgeSec ?? null;
      const accepted24h = register.accepted24h ?? 0;
      const replayed24h = register.replayed24h ?? 0;
      const failed24h = register.failed24h ?? 0;
      const replayRate24h = register.replayRate24h ?? computeReplayRate(accepted24h, replayed24h);
      const lastSyncStatus = register.lastSyncStatus ?? 'IDLE';
      const lastSyncErrorCode = register.lastSyncErrorCode ?? null;
      const degraded = register.degraded ?? lastSyncStatus === 'DEGRADED';

      if (!register.isOnline) {
        severity = 'CRITICAL';
        reasons.push('OFFLINE');
      }

      if (register.failedQueueCount > params.failedThreshold) {
        severity = 'CRITICAL';
        reasons.push(`FAILED_QUEUE>${params.failedThreshold}`);
      }

      if (staleHeartbeat && severity !== 'CRITICAL') {
        severity = 'WARN';
        reasons.push('STALE_HEARTBEAT');
      }

      if (register.pendingQueueCount > params.pendingThreshold && severity !== 'CRITICAL') {
        severity = 'WARN';
        reasons.push(`PENDING_QUEUE>${params.pendingThreshold}`);
      }

      if (
        typeof syncLagMinutes === 'number' &&
        syncLagMinutes > params.syncLagThresholdMinutes &&
        severity !== 'CRITICAL'
      ) {
        severity = 'WARN';
        reasons.push(`SYNC_LAG>${params.syncLagThresholdMinutes}m`);
      }

      if (degraded && severity !== 'CRITICAL') {
        severity = 'WARN';
        reasons.push('DEGRADED_STATUS');
      }

      if (lastSyncErrorCode && severity !== 'CRITICAL') {
        severity = 'WARN';
        reasons.push('LAST_ERROR_PRESENT');
      }

      if (failed24h > 0 && severity !== 'CRITICAL') {
        severity = 'WARN';
        reasons.push('FAILED_24H>0');
      }

      if (syncLagMinutes === null && register.isOnline && severity === 'OK') {
        severity = 'WARN';
        reasons.push('SYNC_UNKNOWN');
      }

      return {
        accepted24h,
        branchName: branch.name,
        degraded,
        failed24h,
        failedQueueCount: register.failedQueueCount,
        isOnline: register.isOnline,
        lastHeartbeatAt: register.lastHeartbeatAt ?? null,
        lastSyncAt: register.lastSyncAt,
        lastSyncErrorCode,
        lastSyncStatus,
        oldestPendingAgeSec,
        pendingQueueCount: register.pendingQueueCount,
        queuePeak,
        reasons: reasons.length > 0 ? reasons.join(', ') : 'HEALTHY',
        registerId: register.id,
        registerName: register.name,
        replayRate24h,
        replayed24h,
        severity,
        staleHeartbeat,
        syncLagMinutes,
      };
    }),
  );
}

export function useOperationsHealthInsights(
  operationsHealth: OperationsHealthResponse | null,
): OperationsHealthInsights {
  const [slaMaxPendingQueue, setSlaMaxPendingQueue] = React.useState('20');
  const [slaMaxFailedQueue, setSlaMaxFailedQueue] = React.useState('0');
  const [slaMaxSyncLagMinutes, setSlaMaxSyncLagMinutes] = React.useState('20');

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const savedPending = window.localStorage.getItem(SLA_PENDING_KEY);
    const savedFailed = window.localStorage.getItem(SLA_FAILED_KEY);
    const savedSyncLag = window.localStorage.getItem(SLA_SYNC_LAG_KEY);
    if (savedPending && savedPending.trim().length > 0) {
      setSlaMaxPendingQueue(savedPending);
    }
    if (savedFailed && savedFailed.trim().length > 0) {
      setSlaMaxFailedQueue(savedFailed);
    }
    if (savedSyncLag && savedSyncLag.trim().length > 0) {
      setSlaMaxSyncLagMinutes(savedSyncLag);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SLA_PENDING_KEY, slaMaxPendingQueue);
  }, [slaMaxPendingQueue]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SLA_FAILED_KEY, slaMaxFailedQueue);
  }, [slaMaxFailedQueue]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SLA_SYNC_LAG_KEY, slaMaxSyncLagMinutes);
  }, [slaMaxSyncLagMinutes]);

  const safePendingThreshold = normalizeIntegerThreshold(slaMaxPendingQueue, 20, 0);
  const safeFailedThreshold = normalizeIntegerThreshold(slaMaxFailedQueue, 0, 0);
  const safeSyncLagThresholdMinutes = normalizeIntegerThreshold(slaMaxSyncLagMinutes, 20, 1);

  const registerHealthMatrix = React.useMemo(() => {
    if (!operationsHealth) {
      return [];
    }
    return buildRegisterHealthMatrix({
      failedThreshold: safeFailedThreshold,
      nowTs: Date.now(),
      operationsHealth,
      pendingThreshold: safePendingThreshold,
      syncLagThresholdMinutes: safeSyncLagThresholdMinutes,
    });
  }, [operationsHealth, safeFailedThreshold, safePendingThreshold, safeSyncLagThresholdMinutes]);

  const matrixSummary = React.useMemo(
    () =>
      registerHealthMatrix.reduce(
        (summary, row) => {
          if (row.severity === 'CRITICAL') {
            summary.critical += 1;
          } else if (row.severity === 'WARN') {
            summary.warn += 1;
          } else {
            summary.ok += 1;
          }
          return summary;
        },
        { critical: 0, ok: 0, warn: 0 },
      ),
    [registerHealthMatrix],
  );

  const hasOpsRisk =
    (operationsHealth?.summary.offlineRegisters ?? 0) > 0 ||
    (operationsHealth?.summary.failedQueueTotal ?? 0) > 0 ||
    (operationsHealth?.summary.staleHeartbeatRegisters ?? 0) > 0;
  const hasOpsQueuePressure = (operationsHealth?.summary.pendingQueueTotal ?? 0) >= safePendingThreshold;

  return {
    hasOpsQueuePressure,
    hasOpsRisk,
    matrixSummary,
    registerHealthMatrix,
    safeFailedThreshold,
    safePendingThreshold,
    safeSyncLagThresholdMinutes,
    setSlaMaxFailedQueue,
    setSlaMaxPendingQueue,
    setSlaMaxSyncLagMinutes,
    slaMaxFailedQueue,
    slaMaxPendingQueue,
    slaMaxSyncLagMinutes,
  };
}
