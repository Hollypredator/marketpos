import React, { useEffect, useMemo, useState } from 'react';

import { useSalesQuery } from '../domain/sales/hooks';
import { useStockLevelsQuery } from '../domain/stock/hooks';
import { useCompaniesQuery, useBranchesQuery } from '../domain/organization/hooks';
import type { SalesListFilters } from '../domain/sales/api';
import type { StockLevel } from '../domain/shared/types';
import { money, toDateTime } from '../lib/format';

interface DashboardPageProps {
  companyId: string;
  branchId: string;
  toMoney: (value: number) => string;
  toDateTime: (value?: string | null) => string;
}

interface Sale {
  id: string;
  receiptNumber: string;
  grandTotal: number;
  status?: string;
  createdAt: string;
  payments: Array<{ method: string; amount: number }>;
}

interface Company {
  id: string;
  name: string;
  licenseKey?: string | null;
}

interface Branch {
  id: string;
  name: string;
}

export function DashboardPage({ companyId, branchId, toMoney, toDateTime }: DashboardPageProps): React.ReactElement {
  const [dailyDate, setDailyDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId);
  const [selectedBranchId, setSelectedBranchId] = useState(branchId);

  const salesQuery = useSalesQuery({
    branchId: selectedBranchId,
    from: dailyDate,
    to: dailyDate,
  } as SalesListFilters);

  const stockLevelsQuery = useStockLevelsQuery(selectedBranchId, true);
  const companiesQuery = useCompaniesQuery(true);
  const branchesQuery = useBranchesQuery(selectedCompanyId, true);

  useEffect(() => {
    if (companiesQuery.data?.length) {
      const found = companiesQuery.data.find((c) => c.id === selectedCompanyId);
      if (!found && companiesQuery.data[0]) {
        setSelectedCompanyId(companiesQuery.data[0].id);
      }
    }
  }, [companiesQuery.data, selectedCompanyId]);

  useEffect(() => {
    if (branchesQuery.data?.length) {
      const found = branchesQuery.data.find((b) => b.id === selectedBranchId);
      if (!found && branchesQuery.data[0]) {
        setSelectedBranchId(branchesQuery.data[0].id);
      }
    }
  }, [branchesQuery.data, selectedBranchId]);

  const todaySales = (salesQuery.data?.data ?? []) as Sale[];
  const totalSales = todaySales.reduce((sum, s) => sum + s.grandTotal, 0);
  const salesCount = todaySales.length;
  const refunds = todaySales.filter((s) => s.status === 'REFUNDED' || s.status === 'PARTIALLY_REFUNDED');
  const netSales = totalSales - refunds.reduce((sum, r) => sum + r.grandTotal, 0);

  const stockLevels = (stockLevelsQuery.data ?? []) as StockLevel[];
  const criticalStock = stockLevels.filter((sl) => sl.quantity !== null && sl.quantity <= (sl.product?.minStock ?? 0) && (sl.product?.minStock ?? 0) > 0);
  const outOfStock = stockLevels.filter((sl) => sl.quantity !== null && sl.quantity <= 0);

  const paymentBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    todaySales.forEach((sale) => {
      sale.payments?.forEach((p) => {
        breakdown[p.method] = (breakdown[p.method] ?? 0) + p.amount;
      });
    });
    return Object.entries(breakdown).map(([method, amount]) => ({ method, amount }));
  }, [todaySales]);

  const recentSales = [...todaySales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

  const PAYMENT_LABELS: Record<string, string> = {
    CASH: 'Nakit',
    CREDIT_CARD: 'Kredi Kartı',
    DEBIT_CARD: 'Banka Kartı',
    ON_ACCOUNT: 'Cari Hesap',
    MULTI: 'Çoklu',
  };

  const statusInfo = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return { label: 'Tamamlandı', cls: 'green' };
      case 'PARTIALLY_REFUNDED':
        return { label: 'Kısmi İade', cls: 'amber' };
      case 'REFUNDED':
        return { label: 'İade Edildi', cls: 'red' };
      default:
        return { label: status, cls: '' };
    }
  };

  return (
    <section className="sub-layout-grid">
      <div className="metric-grid" style={{ gridColumn: '1 / -1', marginBottom: '16px' }}>
        <div className="metric-card primary">
          <span>Bugünkü Satış</span>
          <strong>{toMoney(totalSales)}</strong>
        </div>
        <div className="metric-card success">
          <span>Net Satış</span>
          <strong>{toMoney(netSales)}</strong>
        </div>
        <div className="metric-card">
          <span>İşlem Sayısı</span>
          <strong>{salesCount}</strong>
        </div>
        <div className="metric-card highlight">
          <span>Kritik Stok</span>
          <strong>{criticalStock.length}</strong>
        </div>
        <div className="metric-card">
          <span>Stokta Yok</span>
          <strong>{outOfStock.length}</strong>
        </div>
        <div className="metric-card">
          <span>Toplam Ürün</span>
          <strong>{stockLevels.length}</strong>
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1', marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--fg-2)', marginBottom: '4px' }}>Firma</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              style={{ minWidth: '220px' }}
            >
              {companiesQuery.data?.map((c: Company) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.licenseKey && `(${c.licenseKey.slice(0, 8)}...)`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--fg-2)', marginBottom: '4px' }}>Şube</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              style={{ minWidth: '220px' }}
            >
              {branchesQuery.data?.map((b: Branch) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--fg-2)', marginBottom: '4px' }}>Tarih</label>
            <input
              type="date"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div>
        <article className="card">
          <h2>Ödeme Dağılımı</h2>
          {paymentBreakdown.length === 0 ? (
            <p className="muted">Bugün için ödeme verisi yok</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Yöntem</th>
                    <th style={{ textAlign: 'right' }}>Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentBreakdown.map(({ method, amount }) => (
                    <tr key={method}>
                      <td>{PAYMENT_LABELS[method] ?? method}</td>
                      <td style={{ textAlign: 'right' }}>{toMoney(amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="card" style={{ marginTop: '16px' }}>
          <h2>Son 10 İşlem</h2>
          {recentSales.length === 0 ? (
            <p className="muted">Kayıt yok</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Saat</th>
                    <th>Fiş No</th>
                    <th>Tutar</th>
                    <th>Ödeme</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => {
                    const si = statusInfo(sale.status ?? 'COMPLETED');
                    const paymentMethods = sale.payments?.map((p) => PAYMENT_LABELS[p.method] ?? p.method).join(', ') ?? '—';
                    return (
                      <tr key={sale.id}>
                        <td>{toDateTime(sale.createdAt).split(' ')[1] ?? '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{sale.receiptNumber}</td>
                        <td>{toMoney(sale.grandTotal)}</td>
                        <td>{paymentMethods}</td>
                        <td><span className={`pill ${si.cls}`}>{si.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>

      <div>
        <article className="card">
          <h2>Kritik Stok ({criticalStock.length})</h2>
          {criticalStock.length === 0 ? (
            <p className="muted">Kritik seviyede stok yok</p>
          ) : (
            <div className="table-wrap" style={{ maxHeight: '300px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th style={{ textAlign: 'right' }}>Mevcut</th>
                    <th style={{ textAlign: 'right' }}>Min</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalStock.slice(0, 15).map((sl) => (
                    <tr key={sl.id}>
                      <td>{sl.product?.name ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{sl.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{sl.product?.minStock ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        {outOfStock.length > 0 && (
          <article className="card" style={{ marginTop: '16px' }}>
            <h2>Stokta Yok ({outOfStock.length})</h2>
            <div className="table-wrap" style={{ maxHeight: '200px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th style={{ textAlign: 'right' }}>Mevcut</th>
                  </tr>
                </thead>
                <tbody>
                  {outOfStock.slice(0, 10).map((sl) => (
                    <tr key={sl.id}>
                      <td>{sl.product?.name ?? '—'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--red)' }}>{sl.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

