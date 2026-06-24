import React, { useEffect, useMemo, useState } from 'react';

import { formatCurrency } from '@marketpos/shared';

import ManagerApprovalModal from '../components/ManagerApprovalModal';
import type { ManagerApprovalPayload } from '../components/ManagerApprovalModal';
import { NumericPad } from '../components/NumericPad';
import {
  canWriteOperations,
  createBackup,
  getQueueStatus,
  getBackofficeSettings,
  getBackupPolicy,
  listPendingCustomerOps,
  listPendingProductOps,
  listPendingPurchaseOps,
  listPendingStockOps,
  listPendingSupplierOps,
  listBackups,
  listCashMovements,
  listSecurityEvents,
  listShiftHandovers,
  logSecurityEvent,
  recordCashMovement,
  recordShiftHandover,
  restoreBackup,
  runSync,
  setBackupPolicy as updateBackupPolicy,
  getLocalSetting,
  setLocalSetting,
} from '../services/pos-runtime';
import type {
  BackupFileRecord,
  BackupPolicyState,
  CashMovementRecord,
  CashMovementType,
  SecurityEventRecord,
  ShiftHandoverRecord,
} from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';

const CASH_MOVEMENT_TYPES: Array<{ label: string; value: CashMovementType }> = [
  { label: 'Kasadan Dusum (Drop)', value: 'DROP' },
  { label: 'Kasa Takviye (Safe In)', value: 'SAFE_IN' },
  { label: 'Kasadan Guvenli Kasa (Safe Out)', value: 'SAFE_OUT' },
  { label: 'Kucuk Harcama (Petty Cash)', value: 'PETTY_CASH' },
];

function escapeCsvCell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>): void {
  const content = [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}

function toLocalDateKey(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DailyCloseSummary {
  backupCount: number;
  cashOutTotal: number;
  cashSignedNet: number;
  cashTransactionCount: number;
  criticalEvents: number;
  generatedAt: string;
  handoverAnomalyCount: number;
  handoverCount: number;
  reportDate: string;
  warnEvents: number;
}

interface OfflineAuditCheck {
  key: string;
  message: string;
  passed: boolean;
  value: string;
}

interface OfflineAuditSummary {
  checks: OfflineAuditCheck[];
  failed: number;
  generatedAt: string;
  passed: number;
  scorePercent: number;
}

export default function OperationsPage(): React.ReactElement {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = useMemo(() => selectAuthSession(state), [state]);
  const canMutateOperations = canWriteOperations(activeSession?.user.role);

  const [backups, setBackups] = useState<BackupFileRecord[]>([]);
  const [backupPolicy, setBackupPolicyState] = useState<BackupPolicyState | null>(null);
  const [backupPolicyEnabled, setBackupPolicyEnabled] = useState(true);
  const [backupPolicyIntervalHours, setBackupPolicyIntervalHours] = useState('8');
  const [backupPolicyRetentionDays, setBackupPolicyRetentionDays] = useState('21');
  const [backupPolicyMaxBackups, setBackupPolicyMaxBackups] = useState('60');
  const [isSavingBackupPolicy, setIsSavingBackupPolicy] = useState(false);

  // Automation Settings
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false);
  const [autoCloseTime, setAutoCloseTime] = useState('02:00');
  const [autoOpenEnabled, setAutoOpenEnabled] = useState(false);
  const [autoOpenTime, setAutoOpenTime] = useState('08:00');
  const [autoOpenCash, setAutoOpenCash] = useState('0');


  const [cashAmount, setCashAmount] = useState('');
  const [cashMovements, setCashMovements] = useState<CashMovementRecord[]>([]);
  const [cashNote, setCashNote] = useState('');
  const [cashType, setCashType] = useState<CashMovementType>('DROP');
  const [declaredCash, setDeclaredCash] = useState('');
  const [expectedCash, setExpectedCash] = useState('');
  const [handoverBlindClose, setHandoverBlindClose] = useState(true);
  const [handoverNote, setHandoverNote] = useState('');
  const [handovers, setHandovers] = useState<ShiftHandoverRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoreApprovalOpen, setRestoreApprovalOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string>('');
  const [runtimeInfo, setRuntimeInfo] = useState<{
    apiBaseUrl: string;
    databasePath: string;
    lastSyncedAt: string | null;
    lastSyncStatus: 'DEGRADED' | 'IDLE' | 'OK';
    offlineReadinessPassed: boolean;
    pendingCount: number;
    userDataPath: string;
    version: string;
  } | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventRecord[]>([]);
  const [securitySeverityFilter, setSecuritySeverityFilter] = useState<'ALL' | 'CRITICAL' | 'INFO' | 'WARN'>('ALL');
  const [securitySearch, setSecuritySearch] = useState('');
  const [dailyCloseSummary, setDailyCloseSummary] = useState<DailyCloseSummary | null>(null);
  const [offlineAuditSummary, setOfflineAuditSummary] = useState<OfflineAuditSummary | null>(null);
  const [isRunningOfflineAudit, setIsRunningOfflineAudit] = useState(false);
  const [isManualSyncRunning, setIsManualSyncRunning] = useState(false);

  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartTs = dayStart.getTime();
  const last24hTs = now - 24 * 60 * 60 * 1000;

  const securityEventsFiltered = useMemo(() => {
    const normalizedSearch = securitySearch.trim().toLocaleLowerCase('tr-TR');
    return securityEvents.filter((event) => {
      if (securitySeverityFilter !== 'ALL' && event.severity !== securitySeverityFilter) {
        return false;
      }
      if (normalizedSearch.length === 0) {
        return true;
      }
      const haystack = `${event.eventType} ${event.message} ${event.reason ?? ''}`.toLocaleLowerCase('tr-TR');
      return haystack.includes(normalizedSearch);
    });
  }, [securityEvents, securitySearch, securitySeverityFilter]);

  const operationsSummary = useMemo(() => {
    const cashToday = cashMovements
      .filter((row) => new Date(row.createdAt).getTime() >= dayStartTs)
      .reduce((sum, row) => sum + row.amount, 0);
    const handoverAnomalyCount = handovers.filter((row) => Math.abs(row.difference) >= 1).length;
    const criticalOrWarn24h = securityEvents.filter((row) => {
      const createdAtTs = new Date(row.createdAt).getTime();
      return createdAtTs >= last24hTs && (row.severity === 'CRITICAL' || row.severity === 'WARN');
    }).length;

    return {
      cashToday,
      criticalOrWarn24h,
      handoverAnomalyCount,
    };
  }, [cashMovements, dayStartTs, handovers, last24hTs, securityEvents]);

  const loadData = async (): Promise<void> => {
    if (!activeSession) {
      return;
    }
    setIsLoading(true);
    try {
      const [nextBackups, nextPolicy, nextEvents, nextCash, nextHandovers] = await Promise.all([
        listBackups(),
        getBackupPolicy(),
        listSecurityEvents(60),
        listCashMovements(activeSession.registerId, 40),
        listShiftHandovers(activeSession.registerId, 40),
      ]);
      setBackups(nextBackups);
      setBackupPolicyState(nextPolicy);
      setBackupPolicyEnabled(nextPolicy.enabled);
      setBackupPolicyIntervalHours(String(nextPolicy.intervalHours));
      setBackupPolicyRetentionDays(String(nextPolicy.retentionDays));
      setBackupPolicyMaxBackups(String(nextPolicy.maxBackups));
      setSecurityEvents(nextEvents);
      setCashMovements(nextCash);
      setHandovers(nextHandovers);
      if (window.electronAPI) {
        const runtime = await window.electronAPI.getRuntimeInfo();
        setRuntimeInfo({
          apiBaseUrl: runtime.apiBaseUrl,
          databasePath: runtime.databasePath,
          lastSyncedAt: runtime.lastSyncedAt,
          lastSyncStatus: runtime.lastSyncStatus,
          offlineReadinessPassed: runtime.offlineReadinessPassed,
          pendingCount: runtime.pendingCount,
          userDataPath: runtime.userDataPath,
          version: runtime.version,
        });
      }
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : 'Operasyon verileri yuklenemedi.');
    } finally {
      setIsLoading(false);
    }

    // Load Automation Settings
    try {
      const closeEn = await getLocalSetting('marketpos_auto_close_enabled');
      const closeTime = await getLocalSetting('marketpos_auto_close_time');
      const openEn = await getLocalSetting('marketpos_auto_open_enabled');
      const openTime = await getLocalSetting('marketpos_auto_open_time');
      const openCash = await getLocalSetting('marketpos_auto_open_cash');

      if (closeEn !== null) setAutoCloseEnabled(closeEn === 'true');
      if (closeTime !== null) setAutoCloseTime(closeTime);
      if (openEn !== null) setAutoOpenEnabled(openEn === 'true');
      if (openTime !== null) setAutoOpenTime(openTime);
      if (openCash !== null) setAutoOpenCash(openCash);
    } catch (err) {
      console.warn('Otomasyon ayarlari yuklenemedi');
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeSession?.registerId, activeSession?.sessionId]);

  const saveAutomationSettings = async () => {
    try {
      await Promise.all([
        setLocalSetting('marketpos_auto_close_enabled', String(autoCloseEnabled)),
        setLocalSetting('marketpos_auto_close_time', autoCloseTime),
        setLocalSetting('marketpos_auto_open_enabled', String(autoOpenEnabled)),
        setLocalSetting('marketpos_auto_open_time', autoOpenTime),
        setLocalSetting('marketpos_auto_open_cash', autoOpenCash),
      ]);
      toast.success('Otomasyon ayarları kaydedildi.');
    } catch (err) {
      toast.error('Ayarlar kaydedilemedi.');
    }
  };

  const submitCashMovement = async (): Promise<void> => {
    if (!activeSession) {
      return;
    }
    if (!canMutateOperations) {
      toast.error('Bu islem icin yazma yetkiniz yok.');
      return;
    }
    const amount = Number.parseFloat(cashAmount || '0');
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Nakit hareket tutari sifirdan buyuk olmalidir.');
      return;
    }
    if (cashNote.trim().length < 3) {
      toast.error('Nakit hareketi icin aciklayici bir not girin.');
      return;
    }
    try {
      await recordCashMovement({
        amount,
        movementType: cashType,
        note: cashNote.trim(),
        operatorUserId: activeSession.user.id,
        registerId: activeSession.registerId,
      });
      await logSecurityEvent({
        eventType: 'CASH_MOVEMENT_RECORDED',
        message: `Kasa hareketi kaydedildi (${cashType})`,
        metadataJson: JSON.stringify({ amount, movementType: cashType }),
        operatorUserId: activeSession.user.id,
        reason: cashNote.trim(),
        severity: 'INFO',
      });
      setCashAmount('');
      setCashNote('');
      await loadData();
      toast.success('Nakit hareket kaydi olusturuldu.');
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : 'Nakit hareketi kaydedilemedi.');
    }
  };

  const submitShiftHandover = async (): Promise<void> => {
    if (!activeSession) {
      return;
    }
    if (!canMutateOperations) {
      toast.error('Bu islem icin yazma yetkiniz yok.');
      return;
    }
    const expected = Number.parseFloat(expectedCash || '0');
    const declared = Number.parseFloat(declaredCash || '0');
    if (!Number.isFinite(expected) || expected < 0 || !Number.isFinite(declared) || declared < 0) {
      toast.error('Beklenen ve beyan edilen tutarlar gecersiz.');
      return;
    }
    if (handoverNote.trim().length < 3) {
      toast.error('Vardiya devri icin aciklayici not zorunludur.');
      return;
    }
    try {
      await recordShiftHandover({
        blindClose: handoverBlindClose,
        declaredCash: declared,
        expectedCash: expected,
        note: handoverNote.trim(),
        operatorUserId: activeSession.user.id,
        registerId: activeSession.registerId,
      });
      await logSecurityEvent({
        eventType: 'SHIFT_HANDOVER_RECORDED',
        message: 'Vardiya devir kaydi olusturuldu.',
        metadataJson: JSON.stringify({
          blindClose: handoverBlindClose,
          declaredCash: declared,
          expectedCash: expected,
        }),
        operatorUserId: activeSession.user.id,
        reason: handoverNote.trim(),
        severity: 'INFO',
      });
      setDeclaredCash('');
      setExpectedCash('');
      setHandoverNote('');
      await loadData();
      toast.success('Vardiya devir kaydi olusturuldu.');
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : 'Vardiya devri kaydedilemedi.');
    }
  };

  const runCreateBackup = async (): Promise<void> => {
    if (!canMutateOperations) {
      toast.error('Bu islem icin yazma yetkiniz yok.');
      return;
    }
    try {
      const backup = await createBackup();
      toast.success(`Yedek olusturuldu: ${backup.fileName}`);
      await loadData();
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : 'Yedek olusturulamadi.');
    }
  };

  const submitBackupPolicy = async (): Promise<void> => {
    if (!canMutateOperations) {
      toast.error('Bu islem icin yazma yetkiniz yok.');
      return;
    }
    const intervalHours = Number.parseInt(backupPolicyIntervalHours, 10);
    const retentionDays = Number.parseInt(backupPolicyRetentionDays, 10);
    const maxBackups = Number.parseInt(backupPolicyMaxBackups, 10);

    if (!Number.isFinite(intervalHours) || intervalHours < 1 || intervalHours > 72) {
      toast.error('Yedekleme araligi 1 ile 72 saat arasinda olmalidir.');
      return;
    }
    if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 90) {
      toast.error('Saklama suresi 1 ile 90 gun arasinda olmalidir.');
      return;
    }
    if (!Number.isFinite(maxBackups) || maxBackups < 5 || maxBackups > 240) {
      toast.error('Maksimum yedek adedi 5 ile 240 arasinda olmalidir.');
      return;
    }

    setIsSavingBackupPolicy(true);
    try {
      const updated = await updateBackupPolicy({
        enabled: backupPolicyEnabled,
        intervalHours,
        lastRunAt: backupPolicy?.lastRunAt ?? null,
        maxBackups,
        retentionDays,
      });
      setBackupPolicyState(updated);
      setBackupPolicyEnabled(updated.enabled);
      setBackupPolicyIntervalHours(String(updated.intervalHours));
      setBackupPolicyRetentionDays(String(updated.retentionDays));
      setBackupPolicyMaxBackups(String(updated.maxBackups));
      toast.success('Otomatik yedekleme politikasi kaydedildi.');
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : 'Yedekleme politikasi kaydedilemedi.',
      );
    } finally {
      setIsSavingBackupPolicy(false);
    }
  };

  const startRestoreBackup = (fileName: string): void => {
    setRestoreTarget(fileName);
    setRestoreApprovalOpen(true);
  };

  const exportBackupsCsv = (): void => {
    downloadCsv(
      'ops-backups.csv',
      ['Dosya', 'Olusturma', 'BoyutKB'],
      backups.map((row) => [
        row.fileName,
        new Date(row.createdAt).toLocaleString('tr-TR'),
        (row.sizeBytes / 1024).toFixed(1),
      ]),
    );
  };

  const exportCashMovementsCsv = (): void => {
    downloadCsv(
      'ops-cash-movements.csv',
      ['Zaman', 'Tip', 'Tutar', 'Not'],
      cashMovements.map((row) => [
        new Date(row.createdAt).toLocaleString('tr-TR'),
        row.movementType,
        row.amount,
        row.note ?? '',
      ]),
    );
  };

  const exportHandoversCsv = (): void => {
    downloadCsv(
      'ops-shift-handovers.csv',
      ['Zaman', 'Beklenen', 'Beyan', 'Fark', 'BlindClose', 'Not'],
      handovers.map((row) => [
        new Date(row.createdAt).toLocaleString('tr-TR'),
        row.expectedCash,
        row.declaredCash,
        row.difference,
        row.blindClose ? 'YES' : 'NO',
        row.note ?? '',
      ]),
    );
  };

  const exportSecurityEventsCsv = (): void => {
    downloadCsv(
      'ops-security-events.csv',
      ['Zaman', 'Tip', 'Seviye', 'Mesaj', 'Neden'],
      securityEventsFiltered.map((row) => [
        new Date(row.createdAt).toLocaleString('tr-TR'),
        row.eventType,
        row.severity,
        row.message,
        row.reason ?? '',
      ]),
    );
  };

  const exportDiagnosticsBundle = async (): Promise<void> => {
    if (!activeSession || !window.electronAPI) {
      return;
    }
    try {
      const [
        runtime,
        queue,
        pendingSales,
        pendingRefunds,
        pendingProductOps,
        pendingSupplierOps,
        pendingPurchaseOps,
        pendingCustomerOps,
        pendingStockOps,
        lastSecurityEvents,
      ] = await Promise.all([
        window.electronAPI.getRuntimeInfo(),
        getQueueStatus(),
        window.electronAPI.listPendingSales(250),
        window.electronAPI.listPendingRefunds(250),
        window.electronAPI.listPendingProductOps(250),
        window.electronAPI.listPendingSupplierOps(250),
        window.electronAPI.listPendingPurchaseOps(250),
        window.electronAPI.listPendingCustomerOps(250),
        window.electronAPI.listPendingStockOps(250),
        listSecurityEvents(150),
      ]);

      const failedOnly = {
        customerOps: pendingCustomerOps.filter((row) => row.syncStatus === 'FAILED'),
        productOps: pendingProductOps.filter((row) => row.syncStatus === 'FAILED'),
        purchaseOps: pendingPurchaseOps.filter((row) => row.syncStatus === 'FAILED'),
        refunds: pendingRefunds.filter((row) => row.syncStatus === 'FAILED'),
        sales: pendingSales.filter((row) => row.syncStatus === 'FAILED'),
        stockOps: pendingStockOps.filter((row) => row.syncStatus === 'FAILED'),
        supplierOps: pendingSupplierOps.filter((row) => row.syncStatus === 'FAILED'),
      };

      const bundle = {
        capturedAt: new Date().toISOString(),
        queue,
        runtime,
        session: {
          branchId: activeSession.user.branchId,
          companyId: activeSession.user.companyId,
          registerId: activeSession.registerId,
          role: activeSession.user.role,
          userId: activeSession.user.id,
        },
        failedOnly,
        lastSecurityEvents,
      };
      downloadJson(
        `ops-diagnostics-bundle-${toLocalDateKey(bundle.capturedAt)}.json`,
        bundle,
      );
      toast.success('Teshis paketi disa aktarildi.');
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : 'Teshis paketi olusturulamadi.',
      );
    }
  };

  const generateDailyCloseReport = async (): Promise<void> => {
    const reportDate = toLocalDateKey(new Date().toISOString());
    const cashToday = cashMovements.filter((row) => toLocalDateKey(row.createdAt) === reportDate);
    const handoversToday = handovers.filter((row) => toLocalDateKey(row.createdAt) === reportDate);
    const eventsToday = securityEvents.filter((row) => toLocalDateKey(row.createdAt) === reportDate);
    const backupsToday = backups.filter((row) => toLocalDateKey(row.createdAt) === reportDate);

    const cashSignedNet = cashToday.reduce((sum, row) => {
      if (row.movementType === 'SAFE_IN') {
        return sum + row.amount;
      }
      return sum - row.amount;
    }, 0);
    const cashOutTotal = cashToday.reduce((sum, row) => {
      if (row.movementType === 'SAFE_IN') {
        return sum;
      }
      return sum + row.amount;
    }, 0);
    const handoverAnomalyCount = handoversToday.filter((row) => Math.abs(row.difference) >= 1).length;
    const warnEvents = eventsToday.filter((row) => row.severity === 'WARN').length;
    const criticalEvents = eventsToday.filter((row) => row.severity === 'CRITICAL').length;

    const summary: DailyCloseSummary = {
      backupCount: backupsToday.length,
      cashOutTotal,
      cashSignedNet,
      cashTransactionCount: cashToday.length,
      criticalEvents,
      generatedAt: new Date().toISOString(),
      handoverAnomalyCount,
      handoverCount: handoversToday.length,
      reportDate,
      warnEvents,
    };

    downloadCsv(
      `ops-daily-close-${reportDate}.csv`,
      ['Bolum', 'Alan', 'Deger'],
      [
        ['Summary', 'ReportDate', summary.reportDate],
        ['Summary', 'GeneratedAt', new Date(summary.generatedAt).toLocaleString('tr-TR')],
        ['Summary', 'CashTransactionCount', summary.cashTransactionCount],
        ['Summary', 'CashOutTotal', summary.cashOutTotal.toFixed(2)],
        ['Summary', 'CashSignedNet', summary.cashSignedNet.toFixed(2)],
        ['Summary', 'HandoverCount', summary.handoverCount],
        ['Summary', 'HandoverAnomalyCount', summary.handoverAnomalyCount],
        ['Summary', 'WarnEvents', summary.warnEvents],
        ['Summary', 'CriticalEvents', summary.criticalEvents],
        ['Summary', 'BackupCount', summary.backupCount],
        ...cashToday.map((row) => [
          'CashMovement',
          `${new Date(row.createdAt).toLocaleTimeString('tr-TR')} ${row.movementType}`,
          `${row.amount.toFixed(2)} ${row.note ?? ''}`.trim(),
        ]),
        ...handoversToday.map((row) => [
          'ShiftHandover',
          new Date(row.createdAt).toLocaleTimeString('tr-TR'),
          `Beklenen:${row.expectedCash.toFixed(2)} Beyan:${row.declaredCash.toFixed(2)} Fark:${row.difference.toFixed(2)}`,
        ]),
        ...eventsToday.map((row) => [
          'SecurityEvent',
          `${new Date(row.createdAt).toLocaleTimeString('tr-TR')} ${row.severity}`,
          `${row.eventType} ${row.message}`.trim(),
        ]),
      ],
    );

    setDailyCloseSummary(summary);
    try {
      await logSecurityEvent({
        eventType: 'DAILY_CLOSE_REPORT_EXPORTED',
        message: `Gunluk kapanis raporu disa aktarildi (${reportDate})`,
        metadataJson: JSON.stringify({
          cashTransactionCount: summary.cashTransactionCount,
          criticalEvents: summary.criticalEvents,
          handoverAnomalyCount: summary.handoverAnomalyCount,
          warnEvents: summary.warnEvents,
        }),
        operatorUserId: activeSession?.user.id ?? null,
        severity: summary.criticalEvents > 0 || summary.handoverAnomalyCount > 0 ? 'WARN' : 'INFO',
      });
    } catch {
      // Report export should not fail because of optional local log.
    }
    toast.success(`Gunluk kapanis raporu olusturuldu: ${reportDate}`);
  };

  const runManualSyncNow = async (): Promise<void> => {
    if (!activeSession) {
      return;
    }
    setIsManualSyncRunning(true);
    try {
      const result = await runSync(activeSession);
      if (!result) {
        toast.error('Offline modda manuel sync baslatilamadi.');
        return;
      }
      await loadData();
      toast.success(
        `Sync tamamlandi. Gonderilen: ${result.pushedSales} satis / ${result.pushedRefunds} iade.`,
      );
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : 'Manuel sync basarisiz.');
    } finally {
      setIsManualSyncRunning(false);
    }
  };

  const runOfflineReadinessAudit = async (): Promise<void> => {
    if (!activeSession || !window.electronAPI) {
      return;
    }
    setIsRunningOfflineAudit(true);
    try {
      const [
        runtime,
        queue,
        cachedSession,
        categories,
        products,
        policy,
        pendingProductOps,
        pendingSupplierOps,
        pendingPurchaseOps,
        pendingCustomerOps,
        pendingStockOps,
        backofficeSettings,
      ] = await Promise.all([
        window.electronAPI.getRuntimeInfo(),
        getQueueStatus(),
        window.electronAPI.getCachedSession(),
        window.electronAPI.getCachedCategories(activeSession.user.companyId),
        window.electronAPI.getCachedProducts({
          companyId: activeSession.user.companyId,
        }),
        getBackupPolicy(),
        listPendingProductOps(1000),
        listPendingSupplierOps(1000),
        listPendingPurchaseOps(1000),
        listPendingCustomerOps(1000),
        listPendingStockOps(1000),
        getBackofficeSettings(),
      ]);

      const checks: OfflineAuditCheck[] = [
        {
          key: 'SETUP_OFFLINE_READINESS',
          message: 'Kurulum offline readiness adimi tamamlandi',
          passed: runtime.offlineReadinessPassed,
          value: runtime.offlineReadinessPassed ? 'PASS' : 'FAIL',
        },
        {
          key: 'CACHED_SESSION',
          message: 'Offline login icin cihazda cacheli kullanici/oturum var',
          passed: Boolean(cachedSession),
          value: cachedSession ? 'FOUND' : 'MISSING',
        },
        {
          key: 'CACHED_CATEGORIES',
          message: 'Kategori cache mevcut',
          passed: categories.length > 0,
          value: String(categories.length),
        },
        {
          key: 'CACHED_PRODUCTS',
          message: 'Urun cache mevcut',
          passed: products.length > 0,
          value: String(products.length),
        },
        {
          key: 'QUEUE_PRESSURE',
          message: 'Kuyruk baskisi kontrolu (pending <= 50)',
          passed:
            queue.sales <= backofficeSettings.offlineAudit.maxPendingSales &&
            queue.refunds <= backofficeSettings.offlineAudit.maxPendingRefunds &&
            pendingProductOps.length <= backofficeSettings.offlineAudit.maxPendingProductOps &&
            pendingStockOps.length <= backofficeSettings.offlineAudit.maxPendingStockOps,
          value: String(queue.pendingCount),
        },
        {
          key: 'PENDING_PRODUCT_OPS',
          message: 'Bekleyen urun operasyonu limiti',
          passed: pendingProductOps.length <= backofficeSettings.offlineAudit.maxPendingProductOps,
          value: String(pendingProductOps.length),
        },
        {
          key: 'PENDING_STOCK_OPS',
          message: 'Bekleyen stok operasyonu limiti',
          passed: pendingStockOps.length <= backofficeSettings.offlineAudit.maxPendingStockOps,
          value: String(pendingStockOps.length),
        },
        {
          key: 'PENDING_SUPPLIER_OPS',
          message: 'Bekleyen tedarikci operasyonlari',
          passed: pendingSupplierOps.length <= backofficeSettings.offlineAudit.maxPendingProductOps,
          value: String(pendingSupplierOps.length),
        },
        {
          key: 'PENDING_PURCHASE_OPS',
          message: 'Bekleyen alis faturasi operasyonlari',
          passed: pendingPurchaseOps.length <= backofficeSettings.offlineAudit.maxPendingProductOps,
          value: String(pendingPurchaseOps.length),
        },
        {
          key: 'PENDING_CUSTOMER_OPS',
          message: 'Bekleyen musteri operasyonlari',
          passed: pendingCustomerOps.length <= backofficeSettings.offlineAudit.maxPendingProductOps,
          value: String(pendingCustomerOps.length),
        },
        {
          key: 'BACKUP_POLICY',
          message: 'Otomatik yedekleme aktif',
          passed: policy.enabled,
          value: policy.enabled ? 'ENABLED' : 'DISABLED',
        },
      ];

      const passed = checks.filter((check) => check.passed).length;
      const failed = checks.length - passed;
      const scorePercent = Math.round((passed / checks.length) * 100);
      const generatedAt = new Date().toISOString();
      const summary: OfflineAuditSummary = {
        checks,
        failed,
        generatedAt,
        passed,
        scorePercent,
      };

      downloadCsv(
        `ops-offline-readiness-${toLocalDateKey(generatedAt)}.csv`,
        ['CheckKey', 'Message', 'Passed', 'Value', 'GeneratedAt'],
        checks.map((check) => [check.key, check.message, check.passed ? 'PASS' : 'FAIL', check.value, generatedAt]),
      );

      setOfflineAuditSummary(summary);
      toast.success(`Offline readiness denetimi tamamlandi. Skor: ${scorePercent}%`);
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : 'Offline denetimi calistirilamadi.');
    } finally {
      setIsRunningOfflineAudit(false);
    }
  };

  const approveRestoreBackup = async (
    approval: ManagerApprovalPayload,
  ): Promise<void> => {
    if (restoreTarget.trim().length === 0) {
      return;
    }
    const restored = await restoreBackup(restoreTarget);
    try {
      await logSecurityEvent({
        eventType: 'BACKUP_RESTORE_APPROVED',
        managerUserId: approval.managerUserId,
        message: `Yedek geri yuklendi: ${restored.fileName}`,
        metadataJson: JSON.stringify({
          fileName: restored.fileName,
          managerMethod: approval.method,
        }),
        operatorUserId: activeSession?.user.id ?? null,
        reason: approval.reason,
        severity: 'WARN',
      });
    } catch {
      // Continue even if local security log cannot be written.
    }
    toast.success(`Yedek geri yuklendi: ${restored.fileName}. Uygulama yenileniyor.`);
    setRestoreApprovalOpen(false);
    window.setTimeout(() => window.location.reload(), 400);
  };

  if (!activeSession) {
    return (
      <div className="card" style={{ margin: '1rem' }}>
        Operasyon paneli icin aktif oturum gerekli.
      </div>
    );
  }

  return (
    <>
      <div className="header">
        <span className="header-title">Operasyon Merkezi</span>
        <div className="header-info">
          <span>Register: {activeSession.registerId}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void loadData()} type="button">
            {isLoading ? 'Yukleniyor...' : 'Yenile'}
          </button>
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 98px)', overflow: 'auto', padding: '1rem' }}>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
            Operasyon Ozet KPI
          </h3>
          <div className="modal-grid-two">
            <p>
              <strong>Bugun Nakit Hareket Toplami:</strong> {formatCurrency(operationsSummary.cashToday)}
            </p>
            <p>
              <strong>Vardiya Fark Alarmi (&gt;=1 TRY):</strong> {operationsSummary.handoverAnomalyCount}
            </p>
            <p>
              <strong>Son 24 Saat WARN/CRITICAL:</strong> {operationsSummary.criticalOrWarn24h}
            </p>
            <p>
              <strong>Yedek Sayisi:</strong> {backups.length}
            </p>
            <p>
              <strong>Kuyruk (Runtime):</strong> {runtimeInfo?.pendingCount ?? '-'}
            </p>
            <p>
              <strong>Son Sync Durum:</strong> {runtimeInfo?.lastSyncStatus ?? '-'}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.75rem' }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void generateDailyCloseReport()}
            >
              Tek Tik Gunluk Kapanis Raporu (CSV + Ozet)
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void runOfflineReadinessAudit()}
              disabled={isRunningOfflineAudit}
            >
              {isRunningOfflineAudit ? 'Offline Denetim Calisiyor...' : 'Offline Hazirlik Denetimi'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void runManualSyncNow()}
              disabled={isManualSyncRunning}
            >
              {isManualSyncRunning ? 'Sync Calisiyor...' : 'Manuel Sync Dene'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void exportDiagnosticsBundle()}
            >
              Teshis Paketi JSON
            </button>
          </div>
          {offlineAuditSummary && (
            <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Offline Audit Ozet</th>
                    <th>Deger</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Skor</td>
                    <td>{offlineAuditSummary.scorePercent}%</td>
                  </tr>
                  <tr>
                    <td>PASS</td>
                    <td>{offlineAuditSummary.passed}</td>
                  </tr>
                  <tr>
                    <td>FAIL</td>
                    <td>{offlineAuditSummary.failed}</td>
                  </tr>
                  <tr>
                    <td>Uretim Zamani</td>
                    <td>{new Date(offlineAuditSummary.generatedAt).toLocaleString('tr-TR')}</td>
                  </tr>
                </tbody>
              </table>
              <div className="table-wrapper" style={{ marginTop: '0.6rem' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Durum</th>
                      <th>Deger</th>
                      <th>Aciklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offlineAuditSummary.checks.map((check) => (
                      <tr key={check.key}>
                        <td>{check.key}</td>
                        <td>{check.passed ? 'PASS' : 'FAIL'}</td>
                        <td>{check.value}</td>
                        <td>{check.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {dailyCloseSummary && (
            <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Alan</th>
                    <th>Deger</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Rapor Tarihi</td>
                    <td>{dailyCloseSummary.reportDate}</td>
                  </tr>
                  <tr>
                    <td>Nakit Islem Sayisi</td>
                    <td>{dailyCloseSummary.cashTransactionCount}</td>
                  </tr>
                  <tr>
                    <td>Nakit Cikis Toplami</td>
                    <td>{formatCurrency(dailyCloseSummary.cashOutTotal)}</td>
                  </tr>
                  <tr>
                    <td>Nakit Net (Signed)</td>
                    <td>{formatCurrency(dailyCloseSummary.cashSignedNet)}</td>
                  </tr>
                  <tr>
                    <td>Vardiya Devir Sayisi</td>
                    <td>{dailyCloseSummary.handoverCount}</td>
                  </tr>
                  <tr>
                    <td>Vardiya Fark Alarmi (&gt;=1 TRY)</td>
                    <td>{dailyCloseSummary.handoverAnomalyCount}</td>
                  </tr>
                  <tr>
                    <td>WARN Olay</td>
                    <td>{dailyCloseSummary.warnEvents}</td>
                  </tr>
                  <tr>
                    <td>CRITICAL Olay</td>
                    <td>{dailyCloseSummary.criticalEvents}</td>
                  </tr>
                  <tr>
                    <td>Bugun Uretilen Yedek</td>
                    <td>{dailyCloseSummary.backupCount}</td>
                  </tr>
                  <tr>
                    <td>Olusturma Zamani</td>
                    <td>{new Date(dailyCloseSummary.generatedAt).toLocaleString('tr-TR')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
            Cihaz ve Yedekleme
          </h3>
          <div className="modal-grid-two">
            <div>
              <p><strong>API:</strong> {runtimeInfo?.apiBaseUrl ?? '-'}</p>
              <p><strong>DB:</strong> {runtimeInfo?.databasePath ?? '-'}</p>
              <p><strong>UserData:</strong> {runtimeInfo?.userDataPath ?? '-'}</p>
              <p><strong>Version:</strong> {runtimeInfo?.version ?? '-'}</p>
              <p>
                <strong>Son Otomatik Yedek:</strong>{' '}
                {backupPolicy?.lastRunAt
                  ? new Date(backupPolicy.lastRunAt).toLocaleString('tr-TR')
                  : '-'}
              </p>
              <p>
                <strong>Siradaki Otomatik Yedek:</strong>{' '}
                {backupPolicy?.nextRunAt
                  ? new Date(backupPolicy.nextRunAt).toLocaleString('tr-TR')
                  : '-'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <label className="checkbox-row">
                <input
                  checked={backupPolicyEnabled}
                  onChange={(event) => setBackupPolicyEnabled(event.target.checked)}
                  type="checkbox"
                />
                Otomatik yedekleme aktif
              </label>

              <div className="modal-grid-two">
                <div className="login-field">
                  <label>Aralik (Saat)</label>
                  <input
                    className="input"
                    max={72}
                    min={1}
                    onChange={(event) => setBackupPolicyIntervalHours(event.target.value)}
                    step={1}
                    type="number"
                    value={backupPolicyIntervalHours}
                  />
                </div>
                <div className="login-field">
                  <label>Saklama (Gun)</label>
                  <input
                    className="input"
                    max={90}
                    min={1}
                    onChange={(event) => setBackupPolicyRetentionDays(event.target.value)}
                    step={1}
                    type="number"
                    value={backupPolicyRetentionDays}
                  />
                </div>
              </div>

              <div className="login-field">
                <label>Maksimum Yedek Adedi</label>
                <input
                  className="input"
                  max={240}
                  min={5}
                  onChange={(event) => setBackupPolicyMaxBackups(event.target.value)}
                  step={1}
                  type="number"
                  value={backupPolicyMaxBackups}
                />
              </div>

              <button
                className="btn btn-ghost"
                disabled={isSavingBackupPolicy || !canMutateOperations}
                onClick={() => void submitBackupPolicy()}
                type="button"
              >
                {isSavingBackupPolicy ? 'Kaydediliyor...' : 'Yedekleme Politikasini Kaydet'}
              </button>
              <button className="btn btn-success" type="button" onClick={() => void runCreateBackup()} disabled={!canMutateOperations}>
                Lokal Yedek Olustur
              </button>
              <button className="btn btn-ghost" type="button" onClick={exportBackupsCsv} disabled={backups.length === 0}>
                Yedek CSV Disa Aktar
              </button>
            </div>
          </div>

          <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Dosya</th>
                  <th>Olusturma</th>
                  <th style={{ textAlign: 'right' }}>Boyut</th>
                  <th style={{ textAlign: 'right' }}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((row) => (
                  <tr key={row.fileName}>
                    <td>{row.fileName}</td>
                    <td>{new Date(row.createdAt).toLocaleString('tr-TR')}</td>
                    <td style={{ textAlign: 'right' }}>{(row.sizeBytes / 1024).toFixed(1)} KB</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-warning btn-sm" type="button" onClick={() => startRestoreBackup(row.fileName)}>
                        Geri Yukle
                      </button>
                    </td>
                  </tr>
                ))}
                {backups.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Henuz lokal yedek bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
            Nakit Hareketleri
          </h3>
          <div className="modal-grid-two">
            <div className="login-field">
              <label>Hareket Tipi</label>
              <select className="input" value={cashType} onChange={(event) => setCashType(event.target.value as CashMovementType)}>
                {CASH_MOVEMENT_TYPES.map((row) => (
                  <option key={row.value} value={row.value}>
                    {row.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="login-field">
              <label>Tutar</label>
              <input className="input" type="number" min={0} step="0.01" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} />
            </div>
          </div>
          <div className="login-field">
            <label>Not</label>
            <input className="input" type="text" value={cashNote} onChange={(event) => setCashNote(event.target.value)} />
          </div>
          <button className="btn btn-primary" type="button" onClick={() => void submitCashMovement()} disabled={!canMutateOperations}>
            Hareketi Kaydet
          </button>
          <button
            className="btn btn-ghost"
            style={{ marginLeft: '0.5rem' }}
            type="button"
            onClick={exportCashMovementsCsv}
            disabled={cashMovements.length === 0}
          >
            Nakit CSV Disa Aktar
          </button>

          <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Tip</th>
                  <th style={{ textAlign: 'right' }}>Tutar</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                {cashMovements.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString('tr-TR')}</td>
                    <td>{row.movementType}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.amount)}</td>
                    <td>{row.note ?? '-'}</td>
                  </tr>
                ))}
                {cashMovements.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Nakit hareket kaydi yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
            Vardiya Devir Kaydi (Z-Raporu Katılımı)
          </h3>
          <div className="modal-grid-two">
            <div className="login-field">
              <label>Sistem Beklenen Nakit</label>
              <input className="input" type="number" min={0} step="0.01" value={expectedCash} onChange={(event) => setExpectedCash(event.target.value)} />
            </div>
            <div className="login-field">
              <label>Kasiyer Beyan Edilen Nakit (Dokunmatik)</label>
              <input className="input text-xl font-bold text-teal-400" type="text" readOnly value={declaredCash || '0'} />
              <NumericPad 
                onInput={(k) => setDeclaredCash(prev => prev + k)}
                onBackspace={() => setDeclaredCash(prev => prev.slice(0, -1))}
                onClear={() => setDeclaredCash('')}
              />
            </div>
          </div>
          <label className="checkbox-row" style={{ marginBottom: '0.65rem', marginTop: '1rem' }}>
            <input type="checkbox" checked={handoverBlindClose} onChange={(event) => setHandoverBlindClose(event.target.checked)} />
            Blind close aktif
          </label>
          <div className="login-field mb-4">
            <label>Mutabakat Notu</label>
            <input className="input" type="text" value={handoverNote} onChange={(event) => setHandoverNote(event.target.value)} placeholder="Zorunlu devir veya sayım açıklaması..." />
          </div>
          <button className="btn btn-primary w-full py-3" style={{ fontSize: '1.2rem', marginTop: '0.5rem' }} type="button" onClick={() => void submitShiftHandover()} disabled={!canMutateOperations}>
            Kasayı Mutabık Kapat ve Devret
          </button>
          <button
            className="btn btn-ghost mt-2 w-full"
            type="button"
            onClick={exportHandoversCsv}
            disabled={handovers.length === 0}
          >
            Devir CSV Disa Aktar
          </button>

          <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th style={{ textAlign: 'right' }}>Beklenen</th>
                  <th style={{ textAlign: 'right' }}>Beyan</th>
                  <th style={{ textAlign: 'right' }}>Fark</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                {handovers.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString('tr-TR')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.expectedCash)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.declaredCash)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.difference)}</td>
                    <td>{row.note ?? '-'}</td>
                  </tr>
                ))}
                {handovers.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Vardiya devir kaydi yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
            Guvenlik Audit Akisi
          </h3>
          <div className="modal-grid-two" style={{ marginBottom: '0.65rem' }}>
            <div className="login-field">
              <label>Seviye Filtresi</label>
              <select
                className="input"
                value={securitySeverityFilter}
                onChange={(event) =>
                  setSecuritySeverityFilter(event.target.value as 'ALL' | 'CRITICAL' | 'INFO' | 'WARN')
                }
              >
                <option value="ALL">Tum seviyeler</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="WARN">WARN</option>
                <option value="INFO">INFO</option>
              </select>
            </div>
            <div className="login-field">
              <label>Arama</label>
              <input
                className="input"
                type="text"
                value={securitySearch}
                onChange={(event) => setSecuritySearch(event.target.value)}
                placeholder="Tip, mesaj veya neden"
              />
            </div>
          </div>
          <button
            className="btn btn-ghost"
            type="button"
            style={{ marginBottom: '0.65rem' }}
            onClick={exportSecurityEventsCsv}
            disabled={securityEventsFiltered.length === 0}
          >
            Filtreli Audit CSV Disa Aktar
          </button>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Tip</th>
                  <th>Seviye</th>
                  <th>Mesaj</th>
                </tr>
              </thead>
              <tbody>
                {securityEventsFiltered.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString('tr-TR')}</td>
                    <td>{row.eventType}</td>
                    <td>{row.severity}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
                {securityEventsFiltered.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Filtreye uygun guvenlik olayi kaydi bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isRestoreApprovalOpen && (
        <ManagerApprovalModal
          actionLabel="Yedek Geri Yukleme Onayi"
          companyId={state.user?.companyId}
          description="Yedek geri yukleme islemi kritik bir aksiyondur."
          onCancel={() => setRestoreApprovalOpen(false)}
          onApproved={approveRestoreBackup}
          reasonLabel="Geri Yukleme Nedeni"
          reasonPlaceholder="Ornek: cihaz bozulmasi sonrasi geri donus"
          requireReason
        />
      )}
    </>
  );
}
