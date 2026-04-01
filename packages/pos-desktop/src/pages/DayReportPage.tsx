import React, { useEffect, useMemo, useState } from 'react';

import { formatCurrency } from '@marketpos/shared';

import ManagerApprovalModal from '../components/ManagerApprovalModal';
import {
  closeSession,
  explainRuntimeError,
  fetchDailyReport,
  fetchTopProducts,
  logSecurityEvent,
} from '../services/pos-runtime';
import type { DailyReport, TopProductReportRow } from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';

function byPayment(report: DailyReport | null, method: string): number {
  if (!report) {
    return 0;
  }
  return report.paymentBreakdown
    .filter((item) => item.method === method)
    .reduce((sum, item) => sum + item.total, 0);
}

export default function DayReportPage() {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = useMemo(() => selectAuthSession(state), [state]);

  const [error, setError] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [blindCloseMode, setBlindCloseMode] = useState(true);
  const [isCloseApprovalOpen, setCloseApprovalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastClosedAt, setLastClosedAt] = useState<string | null>(null);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductReportRow[]>([]);

  const cashTotal = byPayment(report, 'CASH');
  const cardTotal = byPayment(report, 'CREDIT_CARD') + byPayment(report, 'DEBIT_CARD');
  const parsedClosingBalance = Number.parseFloat(closingBalance || '0');
  const expectedCash = cashTotal;

  const closeRegisterSession = async (): Promise<void> => {
    if (!activeSession) {
      toast.error('Aktif oturum bulunamadi.');
      return;
    }
    if (!activeSession.accessToken) {
      toast.error('Kasa kapama icin online baglanti gereklidir.');
      return;
    }
    if (!Number.isFinite(parsedClosingBalance) || parsedClosingBalance < 0) {
      toast.error('Gecerli bir kapanis bakiyesi girin.');
      return;
    }
    if (closingNote.trim().length < 3) {
      toast.error('Kasa kapama notu en az 3 karakter olmalidir.');
      return;
    }
    setCloseApprovalOpen(true);
  };

  const executeCloseRegisterSession = async (approval: {
    managerFullName: string;
    managerUserId: string;
    method: 'PASSWORD' | 'PIN';
    reason: string;
  }): Promise<void> => {
    if (!activeSession) {
      return;
    }
    setIsClosing(true);
    try {
      await closeSession(
        activeSession,
        parsedClosingBalance,
        `${closingNote.trim()} | Onay: ${approval.reason}`,
      );
      setLastClosedAt(new Date().toISOString());
      setCloseApprovalOpen(false);
      try {
        await logSecurityEvent({
          eventType: 'SESSION_CLOSE_APPROVED',
          managerUserId: approval.managerUserId,
          message: 'Kasa kapama islemi yonetici onayi ile tamamlandi.',
          metadataJson: JSON.stringify({
            blindCloseMode,
            declaredClosingBalance: parsedClosingBalance,
            expectedCash,
            managerMethod: approval.method,
            operatorUserId: activeSession.user.id,
          }),
          operatorUserId: activeSession.user.id,
          reason: approval.reason,
          severity: 'WARN',
        });
      } catch {
        // Operational flow should continue even when local audit write fails.
      }
      toast.success(
        'Kasa oturumu kapatildi. Yeni gun icin cikis-giris yaptiginizda oturum yeniden acilir.',
      );
      setClosingNote('');
      await loadReport();
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsClosing(false);
    }
  };

  const loadReport = async (): Promise<void> => {
    if (!activeSession) {
      setError('Aktif oturum bulunamadi.');
      setIsLoading(false);
      return;
    }
    if (!activeSession.accessToken) {
      setError('Gunluk rapor icin online baglanti gereklidir.');
      setIsLoading(false);
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const [daily, top] = await Promise.all([
        fetchDailyReport(activeSession),
        fetchTopProducts(activeSession, 8),
      ]);
      setReport(daily);
      setTopProducts(top);
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, [activeSession?.accessToken, activeSession?.sessionId, activeSession?.user.id]);

  return (
    <>
      <div className="header">
        <span className="header-title">Gunluk Rapor</span>
        <div className="header-info">
          <span>{new Date().toLocaleDateString('tr-TR')}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void loadReport()} type="button">
            Yenile
          </button>
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 98px)', overflow: 'auto', padding: '1.5rem' }}>
        {isLoading && <div className="card">Rapor yukleniyor...</div>}
        {!isLoading && error.length > 0 && <div className="card">{error}</div>}

        {!isLoading && report && (
          <>
            <div
              style={{
                display: 'grid',
                gap: '1rem',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                marginBottom: '1.25rem',
              }}
            >
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Satis Adedi</div>
                <div style={{ fontSize: '2rem', fontWeight: 700 }}>{report.salesCount}</div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Toplam Satis</div>
                <div style={{ color: 'var(--success)', fontSize: '2rem', fontWeight: 700 }}>
                  {formatCurrency(report.totalSales)}
                </div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Toplam Iade</div>
                <div style={{ color: 'var(--danger)', fontSize: '2rem', fontWeight: 700 }}>
                  {formatCurrency(report.totalRefunds)}
                </div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Net Satis</div>
                <div style={{ color: 'var(--accent)', fontSize: '2rem', fontWeight: 700 }}>
                  {formatCurrency(report.netSales)}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
                  Odeme Dagilimi
                </h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Nakit</span>
                  <strong>{formatCurrency(cashTotal)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Kart</span>
                  <strong>{formatCurrency(cardTotal)}</strong>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Toplam KDV</span>
                    <strong>{formatCurrency(report.totalVat)}</strong>
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
                  Kasa Kapama
                </h3>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Gun sonu kapanisinda fiziksel kasa bakiyesini girip oturumu kapatin.
                </p>
                <div className="card" style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Beklenen Nakit</span>
                    <strong>{blindCloseMode ? 'Gizli (Blind Close)' : formatCurrency(expectedCash)}</strong>
                  </div>
                  <label className="checkbox-row" style={{ marginTop: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={blindCloseMode}
                      onChange={(event) => setBlindCloseMode(event.target.checked)}
                    />
                    Blind close aktif
                  </label>
                </div>
                <div className="login-field">
                  <label htmlFor="closing-balance">Kapanis Bakiyesi</label>
                  <input
                    id="closing-balance"
                    className="input"
                    min={0}
                    step="0.01"
                    type="number"
                    value={closingBalance}
                    onChange={(event) => setClosingBalance(event.target.value)}
                  />
                </div>
                <div className="login-field">
                  <label htmlFor="closing-note">Not (Opsiyonel)</label>
                  <input
                    id="closing-note"
                    className="input"
                    type="text"
                    value={closingNote}
                    onChange={(event) => setClosingNote(event.target.value)}
                  />
                </div>
                <button
                  className="btn btn-danger btn-lg"
                  type="button"
                  disabled={isClosing || closingBalance.trim().length === 0}
                  onClick={() => void closeRegisterSession()}
                >
                  {isClosing ? 'Kapatiliyor...' : 'Kasayi Kapat'}
                </button>
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
                  Son kapama: {lastClosedAt ? new Date(lastClosedAt).toLocaleString('tr-TR') : '-'}
                </p>
              </div>

              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
                  En Cok Satanlar
                </h3>
                {topProducts.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>Bu tarih araliginda urun kaydi yok.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Urun</th>
                          <th style={{ textAlign: 'right' }}>Adet</th>
                          <th style={{ textAlign: 'right' }}>Ciro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProducts.map((item) => (
                          <tr key={item.productId}>
                            <td>{item.productName}</td>
                            <td style={{ textAlign: 'right' }}>{item.totalQuantity}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(item.totalRevenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {isCloseApprovalOpen && (
        <ManagerApprovalModal
          actionLabel="Kasa Kapatma Onayi"
          companyId={state.user?.companyId}
          description="Kasa kapama islemi yonetici onayi gerektirir."
          onCancel={() => setCloseApprovalOpen(false)}
          onApproved={executeCloseRegisterSession}
          reasonLabel="Onay Nedeni"
          reasonPlaceholder="Ornek: Vardiya sonu kontrolu tamamlandi"
          requireReason
        />
      )}
    </>
  );
}
