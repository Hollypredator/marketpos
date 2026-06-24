import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '@marketpos/shared';

import type { RuntimeInfo } from '../electron-api';
import {
  explainRuntimeError,
  fetchDailyReport,
  fetchSales,
  fetchTopProducts,
} from '../services/pos-runtime';
import type { DailyReport, TopProductReportRow } from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';

function paymentMethodLabel(method: string | undefined): string {
  if (method === 'CASH') {
    return 'Nakit';
  }
  if (method === 'CREDIT_CARD') {
    return 'Kredi Karti';
  }
  if (method === 'DEBIT_CARD') {
    return 'Banka Karti';
  }
  if (method === 'ON_ACCOUNT') {
    return 'Cari';
  }
  return '-';
}

export default function DashboardPage() {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = useMemo(() => selectAuthSession(state), [state]);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductReportRow[]>([]);

  const paymentDistribution = (report?.paymentBreakdown ?? []).map((row) => ({
    label: paymentMethodLabel(row.method),
    value: row.total,
  }));
  const maxDistribution = Math.max(1, ...paymentDistribution.map((row) => row.value));

  useEffect(() => {
    if (!activeSession) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError('');
    void Promise.allSettled([
      fetchDailyReport(activeSession),
      fetchTopProducts(activeSession, 5),
      fetchSales(activeSession, { limit: 5 }),
      window.electronAPI?.getRuntimeInfo(),
    ])
      .then(([dailyResult, topResult, salesResult, runtimeResult]) => {
        if (cancelled) {
          return;
        }
        if (dailyResult.status === 'fulfilled') {
          setReport(dailyResult.value);
        } else {
          setReport(null);
        }
        if (topResult.status === 'fulfilled') {
          setTopProducts(topResult.value);
        } else {
          setTopProducts([]);
        }
        if (salesResult.status === 'fulfilled') {
          setRecentSales(salesResult.value.data);
        } else {
          setRecentSales([]);
        }
        if (runtimeResult.status === 'fulfilled' && runtimeResult.value) {
          setRuntimeInfo(runtimeResult.value);
        }
        if (
          dailyResult.status === 'rejected' &&
          topResult.status === 'rejected' &&
          salesResult.status === 'rejected'
        ) {
          throw dailyResult.reason;
        }
      })
      .catch((caughtError: unknown) => {
        if (cancelled) {
          return;
        }
        const message = explainRuntimeError(caughtError);
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSession?.accessToken, activeSession?.sessionId]);

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Dashboard yukleniyor...</div>;
  }

  return (
    <div style={{ height: 'calc(100vh - 65px)', overflowY: 'auto', padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.3rem' }}>
          Merhaba, {activeSession?.user.fullName}
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Bugun icin gercek zamanli kasa ozeti.
        </p>
      </div>

      {error.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1rem' }}>
        <div className="card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Toplam Satis</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>{formatCurrency(report?.totalSales ?? 0)}</div>
        </div>
        <div className="card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Fis Sayisi</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>{report?.salesCount ?? 0}</div>
        </div>
        <div className="card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Iade Toplami</div>
          <div style={{ color: 'var(--danger)', fontSize: '1.7rem', fontWeight: 800 }}>
            {formatCurrency(report?.totalRefunds ?? 0)}
          </div>
        </div>
        <div className="card">
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Net Satis</div>
          <div style={{ color: 'var(--accent)', fontSize: '1.7rem', fontWeight: 800 }}>
            {formatCurrency(report?.netSales ?? 0)}
          </div>
        </div>
      </div>

      {runtimeInfo && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Offline KPI</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.6rem' }}>
            <span>Sync Durum: {runtimeInfo.lastSyncStatus}</span>
            <span>Toplam Kuyruk: {runtimeInfo.pendingCount}</span>
            <span>Kurulum-Ilk Satis: {runtimeInfo.setupMetrics.durationMin ?? '-'} dk</span>
            <span>
              Ilk Satis: {runtimeInfo.setupMetrics.firstSaleAt ? new Date(runtimeInfo.setupMetrics.firstSaleAt).toLocaleTimeString('tr-TR') : '-'}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '2fr 1fr', marginBottom: '1rem' }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>Odeme Dagilimi</h3>
          <div style={{ alignItems: 'flex-end', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', height: '180px', paddingBottom: '0.8rem' }}>
            {paymentDistribution.map((row) => (
              <div key={row.label} style={{ alignItems: 'center', display: 'flex', flex: 1, flexDirection: 'column', gap: '0.4rem' }}>
                <div
                  className="report-card-bar"
                  style={{
                    background: 'var(--bg-hover)',
                    borderRadius: '4px 4px 0 0',
                    height: `${Math.max(2, (row.value / maxDistribution) * 130)}px`,
                    width: '70%',
                  }}
                />
                <span style={{ fontSize: '0.72rem' }}>{row.label}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{formatCurrency(row.value)}</span>
              </div>
            ))}
            {paymentDistribution.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', margin: 'auto' }}>Henuz odeme verisi yok.</div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>En Cok Satanlar</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {topProducts.map((row) => (
              <div key={row.productId} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', padding: '0.65rem' }}>
                <div style={{ fontWeight: 600 }}>{row.productName}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  {row.totalQuantity.toFixed(0)} adet | {formatCurrency(row.totalRevenue)}
                </div>
              </div>
            ))}
            {topProducts.length === 0 && (
              <div style={{ color: 'var(--text-secondary)' }}>Satis verisi yok.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>Son Islemler</h3>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Fis No</th>
                <th>Saat</th>
                <th>Kasiyer</th>
                <th>Yontem</th>
                <th style={{ textAlign: 'right' }}>Tutar</th>
                <th style={{ textAlign: 'center' }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((sale, index) => (
                <tr key={`${sale.id}-${index}`}>
                  <td style={{ fontWeight: 600 }}>{sale.receiptNumber}</td>
                  <td>{new Date(sale.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{sale.user?.fullName ?? '-'}</td>
                  <td>
                    {Array.isArray(sale.payments) && sale.payments.length > 0
                      ? [...new Set(sale.payments.map((payment: { method?: string }) => paymentMethodLabel(payment.method)))].join(' + ')
                      : '-'}
                  </td>
                  <td style={{ fontWeight: 700, textAlign: 'right' }}>{formatCurrency(sale.grandTotal ?? 0)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: 'var(--success-light)', borderRadius: '12px', color: 'var(--success)', fontSize: '0.75rem', padding: '2px 8px' }}>
                      Tamamlandi
                    </span>
                  </td>
                </tr>
              ))}
              {recentSales.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--text-secondary)', padding: '1.2rem', textAlign: 'center' }}>
                    Henuz islem kaydi bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
