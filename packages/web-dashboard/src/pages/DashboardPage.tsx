import React, { useEffect, useMemo, useState } from 'react';

import { useSalesQuery } from '../domain/sales/hooks';
import { useStockLevelsQuery } from '../domain/stock/hooks';
import { useCompaniesQuery, useBranchesQuery } from '../domain/organization/hooks';
import type { SalesListFilters } from '../domain/sales/api';
import type { StockLevel } from '../domain/shared/types';
import { money, toDateTime } from '../lib/format';

interface Company {
  id: string;
  name: string;
  licenseKey?: string | null;
}

interface Branch {
  id: string;
  name: string;
}

interface Sale {
  id: string;
  receiptNumber: string;
  grandTotal: number;
  status?: string;
  createdAt: string;
  payments: Array<{ method: string; amount: number }>;
}

export function DashboardPage({ companyId: _companyId }: { companyId: string; branchId: string; toMoney: (v: number) => string; toDateTime: (v?: string | null) => string }): React.ReactElement {
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(_companyId);
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const salesQuery = useSalesQuery({ branchId: selectedBranchId, from: dailyDate, to: dailyDate } as SalesListFilters);
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
  const averageTicket = salesCount > 0 ? totalSales / salesCount : 0;
  const refunds = todaySales.filter((s) => s.status === 'REFUNDED' || s.status === 'PARTIALLY_REFUNDED');
  const netSales = totalSales - refunds.reduce((sum, r) => sum + r.grandTotal, 0);

  const stockLevels = (stockLevelsQuery.data ?? []) as StockLevel[];
  const criticalStock = stockLevels.filter((sl) => sl.quantity !== null && sl.quantity <= (sl.product?.minStock ?? 0) && (sl.product?.minStock ?? 0) > 0);
  const outOfStock = stockLevels.filter((sl) => sl.quantity !== null && sl.quantity <= 0);

  const activeBranches = branchesQuery.data?.filter((b) => b.isActive !== false).length ?? 0;
  const totalBranches = branchesQuery.data?.length ?? 0;

  const paymentBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    todaySales.forEach((sale) => {
      sale.payments?.forEach((p) => {
        breakdown[p.method] = (breakdown[p.method] ?? 0) + p.amount;
      });
    });
    return Object.entries(breakdown).map(([method, amount]) => ({ method, amount }));
  }, [todaySales]);

  const recentSales = [...todaySales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── Bento KPI Grid (Stitch-style 4-col) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
      }}>
        <div className="metric-card primary" style={{ borderColor: 'rgba(210,187,255,0.15)' }}>
          <span>Günlük Satış</span>
          <strong>{money(totalSales)}</strong>
          <span className="metric-delta up">Net: {money(netSales)}</span>
        </div>
        <div className="metric-card">
          <span>Fiş Sayısı</span>
          <strong>{salesCount}</strong>
          <span className="metric-delta">Bugünkü işlem</span>
        </div>
        <div className="metric-card success" style={{ borderColor: 'rgba(78,222,163,0.15)' }}>
          <span>Ortalama Sepet</span>
          <strong>{money(averageTicket)}</strong>
          <span className="metric-delta">İşlem başı</span>
        </div>
        <div className="metric-card">
          <span>Aktif Şube</span>
          <strong>{activeBranches}/{totalBranches}</strong>
          <span className="metric-delta">Kritik Stok: {criticalStock.length}</span>
        </div>
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="toolbar">
        <div className="scope-row">
          <label>
            Firma
            <select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} style={{ minWidth: '220px' }}>
              {companiesQuery.data?.map((c: Company) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Şube
            <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} style={{ minWidth: '220px' }}>
              {branchesQuery.data?.map((b: Branch) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label>
            Tarih
            <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />
          </label>
        </div>
      </div>

      {/* ── 2-Column Grid ── */}
      <div className="sub-layout-grid">
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Payment breakdown card */}
          <article className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Ödeme Dağılımı</h3>
                <p className="card-sub">Bugünkü satışların ödeme yöntemine göre dağılımı</p>
              </div>
            </div>
            {paymentBreakdown.length === 0 ? (
              <p className="empty-state" style={{ padding: '24px' }}>
                <span className="empty-state-title">Ödeme verisi yok</span>
                <span className="empty-state-sub">Bugün için kayıtlı işlem bulunamadı</span>
              </p>
            ) : (
              <div className="table-wrap tall">
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
                        <td>{method === 'CASH' ? 'Nakit' : method === 'CREDIT_CARD' ? 'Kredi Kartı' : method === 'DEBIT_CARD' ? 'Banka Kartı' : method === 'ON_ACCOUNT' ? 'Cari Hesap' : method}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          {/* Critical stock */}
          <article className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Kritik Stok ({criticalStock.length})</h3>
                <p className="card-sub">Minimum seviyenin altındaki ürünler</p>
              </div>
            </div>
            {criticalStock.length === 0 ? (
              <p className="empty-state" style={{ padding: '24px' }}>
                <span className="empty-state-title">Kritik stok yok</span>
                <span className="empty-state-sub">Tüm ürünler yeterli seviyede</span>
              </p>
            ) : (
              <div className="table-wrap tall" style={{ maxHeight: '280px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th style={{ textAlign: 'right' }}>Mevcut</th>
                      <th style={{ textAlign: 'right' }}>Min Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criticalStock.slice(0, 10).map((sl) => (
                      <tr key={sl.id}>
                        <td>{sl.product?.name ?? '—'}</td>
                        <td style={{ textAlign: 'right', color: 'var(--red)' }}>{sl.quantity}</td>
                        <td style={{ textAlign: 'right', color: 'var(--fg-3)' }}>{sl.product?.minStock ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Recent sales */}
          <article className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Son İşlemler</h3>
                <p className="card-sub">Bugünkü son 8 fiş</p>
              </div>
            </div>
            {recentSales.length === 0 ? (
              <p className="empty-state" style={{ padding: '24px' }}>
                <span className="empty-state-title">İşlem yok</span>
                <span className="empty-state-sub">Bugün henüz satış kaydedilmemiş</span>
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {recentSales.map((sale) => {
                  const isRefunded = sale.status === 'REFUNDED' || sale.status === 'PARTIALLY_REFUNDED';
                  return (
                    <div key={sale.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: 'var(--bg-2)',
                      borderRadius: 'var(--r-md)',
                      border: '1px solid var(--border-s)',
                      fontSize: '13px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: isRefunded ? 'var(--red)' : 'var(--emerald)',
                          flexShrink: 0,
                        }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--fg-2)' }}>#{sale.receiptNumber}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{money(sale.grandTotal)}</span>
                        <span style={{ color: 'var(--fg-4)', fontSize: '12px' }}>
                          {toDateTime(sale.createdAt).split(' ')[1] ?? ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          {/* Out of stock */}
          {outOfStock.length > 0 && (
            <article className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Stokta Yok ({outOfStock.length})</h3>
                  <p className="card-sub">Tükenen ürünler</p>
                </div>
              </div>
              <div className="table-wrap tall" style={{ maxHeight: '200px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th style={{ textAlign: 'right' }}>Adet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outOfStock.slice(0, 8).map((sl) => (
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
      </div>
    </div>
  );
}
