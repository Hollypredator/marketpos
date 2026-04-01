import React, { useEffect, useMemo, useState } from 'react';

import { formatCurrency } from '@marketpos/shared';

import ManagerApprovalModal from '../components/ManagerApprovalModal';
import {
  createBackup,
  getBackupPolicy,
  listBackups,
  listCashMovements,
  listSecurityEvents,
  listShiftHandovers,
  logSecurityEvent,
  recordCashMovement,
  recordShiftHandover,
  restoreBackup,
  setBackupPolicy as updateBackupPolicy,
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

export default function OperationsPage(): React.ReactElement {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = useMemo(() => selectAuthSession(state), [state]);

  const [backups, setBackups] = useState<BackupFileRecord[]>([]);
  const [backupPolicy, setBackupPolicyState] = useState<BackupPolicyState | null>(null);
  const [backupPolicyEnabled, setBackupPolicyEnabled] = useState(true);
  const [backupPolicyIntervalHours, setBackupPolicyIntervalHours] = useState('8');
  const [backupPolicyRetentionDays, setBackupPolicyRetentionDays] = useState('21');
  const [backupPolicyMaxBackups, setBackupPolicyMaxBackups] = useState('60');
  const [isSavingBackupPolicy, setIsSavingBackupPolicy] = useState(false);
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
    userDataPath: string;
    version: string;
  } | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventRecord[]>([]);

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
          userDataPath: runtime.userDataPath,
          version: runtime.version,
        });
      }
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : 'Operasyon verileri yuklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeSession?.registerId, activeSession?.sessionId]);

  const submitCashMovement = async (): Promise<void> => {
    if (!activeSession) {
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
    try {
      const backup = await createBackup();
      toast.success(`Yedek olusturuldu: ${backup.fileName}`);
      await loadData();
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : 'Yedek olusturulamadi.');
    }
  };

  const submitBackupPolicy = async (): Promise<void> => {
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

  const approveRestoreBackup = async (approval: {
    managerFullName: string;
    managerUserId: string;
    method: 'PASSWORD' | 'PIN';
    reason: string;
  }): Promise<void> => {
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
                disabled={isSavingBackupPolicy}
                onClick={() => void submitBackupPolicy()}
                type="button"
              >
                {isSavingBackupPolicy ? 'Kaydediliyor...' : 'Yedekleme Politikasini Kaydet'}
              </button>
              <button className="btn btn-success" type="button" onClick={() => void runCreateBackup()}>
                Lokal Yedek Olustur
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
          <button className="btn btn-primary" type="button" onClick={() => void submitCashMovement()}>
            Hareketi Kaydet
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
            Vardiya Devir Kaydi
          </h3>
          <div className="modal-grid-two">
            <div className="login-field">
              <label>Beklenen Nakit</label>
              <input className="input" type="number" min={0} step="0.01" value={expectedCash} onChange={(event) => setExpectedCash(event.target.value)} />
            </div>
            <div className="login-field">
              <label>Beyan Edilen Nakit</label>
              <input className="input" type="number" min={0} step="0.01" value={declaredCash} onChange={(event) => setDeclaredCash(event.target.value)} />
            </div>
          </div>
          <label className="checkbox-row" style={{ marginBottom: '0.65rem' }}>
            <input type="checkbox" checked={handoverBlindClose} onChange={(event) => setHandoverBlindClose(event.target.checked)} />
            Blind close aktif
          </label>
          <div className="login-field">
            <label>Not</label>
            <input className="input" type="text" value={handoverNote} onChange={(event) => setHandoverNote(event.target.value)} />
          </div>
          <button className="btn btn-primary" type="button" onClick={() => void submitShiftHandover()}>
            Vardiya Devrini Kaydet
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
                {securityEvents.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString('tr-TR')}</td>
                    <td>{row.eventType}</td>
                    <td>{row.severity}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
                {securityEvents.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Guvenlik olayi kaydi bulunmuyor.
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
