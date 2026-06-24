import React, { useEffect, useMemo, useState } from 'react';

import { formatCurrency } from '@marketpos/shared';

import ManagerApprovalModal from '../components/ManagerApprovalModal';
import type { ManagerApprovalPayload } from '../components/ManagerApprovalModal';
import {
  closeSession,
  explainRuntimeError,
  fetchDailyReport,
  fetchSessions,
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

type Tab = 'daily' | 'sessions';

function toLocalDateInputValue(date: Date): string {
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

export default function DayReportPage() {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = useMemo(() => selectAuthSession(state), [state]);

  const [activeTab, setActiveTab] = useState<Tab>('daily');
  const [selectedDate, setSelectedDate] = useState(toLocalDateInputValue(new Date()));
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
  const [sessions, setSessions] = useState<any[]>([]);

  const cashTotal = byPayment(report, 'CASH');
  const cardTotal = byPayment(report, 'CREDIT_CARD') + byPayment(report, 'DEBIT_CARD');
  const onAccountTotal = byPayment(report, 'ON_ACCOUNT');
  const parsedClosingBalance = Number.parseFloat(closingBalance || '0');
  const expectedCash = cashTotal;

  const totalPayment = cashTotal + cardTotal + onAccountTotal;
  const cashPercent = totalPayment > 0 ? (cashTotal / totalPayment) * 100 : 0;
  const cardPercent = totalPayment > 0 ? (cardTotal / totalPayment) * 100 : 0;
  const onAccountPercent = totalPayment > 0 ? (onAccountTotal / totalPayment) * 100 : 0;

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

  const executeCloseRegisterSession = async (
    approval: ManagerApprovalPayload,
  ): Promise<void> => {
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

    setError('');
    setIsLoading(true);
    try {
      const [daily, top] = await Promise.all([
        fetchDailyReport(activeSession, selectedDate),
        fetchTopProducts(activeSession, 8, selectedDate),
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

  const loadSessions = async (): Promise<void> => {
    if (!activeSession || !activeSession.accessToken) return;
    try {
      const result = await fetchSessions(activeSession);
      setSessions(result.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'daily') {
      void loadReport();
    } else {
      void loadSessions();
    }
  }, [activeSession?.accessToken, activeSession?.sessionId, activeSession?.user.id, selectedDate, activeTab]);

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(toLocalDateInputValue(d));
  };

  const isToday = selectedDate === toLocalDateInputValue(new Date());

  return (
    <>
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="header-title">Raporlar</span>
          <div className="tabs" style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
            <button 
              className={`btn btn-sm ${activeTab === 'daily' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('daily')}
            >
              Günlük Özet
            </button>
            <button 
              className={`btn btn-sm ${activeTab === 'sessions' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('sessions')}
            >
              Z-Raporu Geçmişi
            </button>
          </div>
        </div>
        <div className="header-info">
          {activeTab === 'daily' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button className="btn btn-sm btn-ghost" onClick={() => changeDate(-1)}>◀</button>
              <input 
                type="date" 
                className="input" 
                style={{ width: '150px', height: '32px', padding: '0 8px' }}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
              <button className="btn btn-sm btn-ghost" onClick={() => changeDate(1)} disabled={isToday}>▶</button>
            </div>
          )}
          <span>|</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void loadReport()} type="button">
            Yenile
          </button>
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 98px)', overflow: 'auto', padding: '1.5rem' }}>
        {activeTab === 'sessions' ? (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Kapatılmış Oturumlar</h3>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Açılış</th>
                    <th>Kapanış</th>
                    <th>Kasa</th>
                    <th>Kullanıcı</th>
                    <th style={{ textAlign: 'right' }}>Son Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{new Date(s.createdAt).toLocaleString('tr-TR')}</td>
                      <td>{s.closedAt ? new Date(s.closedAt).toLocaleString('tr-TR') : '-'}</td>
                      <td>{s.register?.name}</td>
                      <td>{s.user?.fullName}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(s.closingBalance || 0)}</td>
                    </tr>
                  ))}
                  {sessions.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Kayıt seçili kriterlere göre bulunamadı.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {isLoading && <div className="card">Rapor yukleniyor...</div>}
            {!isLoading && error.length > 0 && <div className="card">{error}</div>}

            {!isLoading && report && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gap: '1rem',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    marginBottom: '1.5rem',
                  }}
                >
                  <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>İşlem Adedi</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>{report.salesCount}</div>
                  </div>
                  <div className="card" style={{ borderLeft: '4px solid var(--success)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Ciro (Brüt)</div>
                    <div style={{ color: 'var(--success)', fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>
                      {formatCurrency(report.totalSales)}
                    </div>
                  </div>
                  <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>İade Tutarı</div>
                    <div style={{ color: 'var(--danger)', fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>
                      {formatCurrency(report.totalRefunds)}
                    </div>
                  </div>
                  <div className="card" style={{ borderLeft: '4px solid var(--accent)', background: 'var(--bg-secondary)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Net Kazanç</div>
                    <div style={{ color: 'var(--accent)', fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>
                      {formatCurrency(report.netSales)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '1fr 1fr' }}>
                  <div className="card">
                    <h3 className="card-title" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between' }}>
                      Ödeme Yöntemleri
                      <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>{report.salesCount} Satış</span>
                    </h3>
                    
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span>Nakit</span>
                        <strong>{formatCurrency(cashTotal)} ({cashPercent.toFixed(0)}%)</strong>
                      </div>
                      <div style={{ height: '8px', background: '#ddd', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${cashPercent}%`, background: 'var(--success)' }} />
                      </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span>Kredi / Banka Kartı</span>
                        <strong>{formatCurrency(cardTotal)} ({cardPercent.toFixed(0)}%)</strong>
                      </div>
                      <div style={{ height: '8px', background: '#ddd', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${cardPercent}%`, background: 'var(--accent)' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span>Cari</span>
                        <strong>{formatCurrency(onAccountTotal)} ({onAccountPercent.toFixed(0)}%)</strong>
                      </div>
                      <div style={{ height: '8px', background: '#ddd', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${onAccountPercent}%`, background: 'var(--warning)' }} />
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', marginTop: '1rem', paddingTop: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Toplam KDV Dağılımı</span>
                        <strong>{formatCurrency(report.totalVat)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ border: isToday ? '1px solid var(--border)' : '1px dashed var(--border)', opacity: isToday ? 1 : 0.8 }}>
                    <h3 className="card-title" style={{ marginBottom: '1rem' }}>
                      Kasa Kapama (Z-Raporu)
                    </h3>
                    {!isToday && (
                      <div style={{ padding: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                        ⚠️ Geçmiş bir gün için kasa kapama yapılamaz.
                      </div>
                    )}
                    <div className="card" style={{ marginBottom: '1rem', background: 'var(--bg-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Beklenen Nakit</span>
                        <strong>{blindCloseMode ? 'Gizlenmiş' : formatCurrency(expectedCash)}</strong>
                      </div>
                      {isToday && (
                        <label className="checkbox-row" style={{ marginTop: '0.75rem' }}>
                          <input
                            type="checkbox"
                            checked={blindCloseMode}
                            onChange={(event) => setBlindCloseMode(event.target.checked)}
                          />
                          Rakamı benden sakla (Blind Close)
                        </label>
                      )}
                    </div>
                    <div className="modal-grid-two">
                      <div className="login-field">
                        <label>Fiziksel Kasa Bakiyesi</label>
                        <input
                          className="input"
                          disabled={!isToday}
                          min={0}
                          step="0.01"
                          type="number"
                          value={closingBalance}
                          onChange={(event) => setClosingBalance(event.target.value)}
                        />
                      </div>
                      <div className="login-field">
                        <label>Vardiya Notu</label>
                        <input
                          className="input"
                          disabled={!isToday}
                          type="text"
                          placeholder="İsteğe bağlı..."
                          value={closingNote}
                          onChange={(event) => setClosingNote(event.target.value)}
                        />
                      </div>
                    </div>
                    <button
                      className="btn btn-danger btn-block"
                      style={{ marginTop: '0.5rem' }}
                      type="button"
                      disabled={!isToday || isClosing || closingBalance.trim().length === 0}
                      onClick={() => void closeRegisterSession()}
                    >
                      {isClosing ? 'İşleniyor...' : 'Kasayı Kapat ve Raporu Onayla'}
                    </button>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '0.85rem', textAlign: 'center' }}>
                      Son İşlem: {lastClosedAt ? new Date(lastClosedAt).toLocaleString('tr-TR') : '-'}
                    </p>
                  </div>

                  <div className="card" style={{ gridColumn: '1 / -1' }}>
                    <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>
                      Ürün Bazlı Performans (En Çok Satanlar)
                    </h3>
                    {topProducts.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Bu tarihte henüz satış kaydı bulunmuyor.
                      </div>
                    ) : (
                      <div className="table-wrapper">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Ürün Adı</th>
                              <th style={{ textAlign: 'center' }}>Satış Adedi</th>
                              <th style={{ textAlign: 'right', width: '200px' }}>Toplam Ciro</th>
                              <th style={{ width: '250px' }}>Gelir Payı</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topProducts.map((item) => {
                              const share = report.totalSales > 0 ? (item.totalRevenue / report.totalSales) * 100 : 0;
                              return (
                                <tr key={item.productId}>
                                  <td style={{ fontWeight: 600 }}>{item.productName}</td>
                                  <td style={{ textAlign: 'center' }}>{item.totalQuantity} adet</td>
                                  <td style={{ textAlign: 'right' }}>{formatCurrency(item.totalRevenue)}</td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ flex: 1, height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${share}%`, background: 'var(--success)' }} />
                                      </div>
                                      <span style={{ fontSize: '0.75rem', width: '35px' }}>%{share.toFixed(0)}</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {isCloseApprovalOpen && (
        <ManagerApprovalModal
          actionLabel="Kasa Kapatma Onayı"
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
