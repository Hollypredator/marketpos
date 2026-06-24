import React from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { TableState } from '../components/TableState';
import { useClientPagination } from '../hooks/use-client-pagination';
import { downloadCsv } from '../lib/format';
import type { OperationsHealthResponse } from '../domain/shared/types';
import { useOperationsHealthInsights } from './reports/use-operations-health-insights';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface ReportRange {
  from: string;
  to: string;
}

interface RegisterRow {
  id: string;
  name: string;
}

interface DailyReport {
  date: string;
  paymentBreakdown: Array<{ method: string; total: number }>;
  refundsCount: number;
  salesCount: number;
  totalRefunds: number;
  totalSales: number;
  totalVat: number;
  netSales: number;
}

interface TopProduct {
  count: number;
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

interface ReportSession {
  id: string;
  status: string;
  openingBalance: number;
  closingBalance?: number | null;
  difference?: number | null;
  createdAt: string;
  closedAt?: string | null;
  register: { name: string };
  user: { fullName: string };
}

interface BranchComparisonRow {
  branchId: string;
  branchName: string;
  refundsCount: number;
  salesCount: number;
  totalRefunds: number;
  totalSales: number;
  totalVat: number;
  netSales: number;
}

interface ReportKpis {
  averageTicket: number;
  criticalStockCount: number;
  sessionGrossSales: number;
  sessionNetSales: number;
  sessionRefundTotal: number;
}

interface ReportsPageProps {
  branchComparisonErrorText: string | null;
  branchComparisonRows: BranchComparisonRow[];
  dailyDate: string;
  dailyReport: DailyReport | null;
  loadingOperationsHealth: boolean;
  loadingReports: boolean;
  onApplyRangePreset: (preset: 'day' | 'week' | 'month') => void;
  onDailyDateChange: (value: string) => void;
  onLoadReports: () => void;
  onReportRangeChange: (updater: (current: ReportRange) => ReportRange) => void;
  onReportRegisterChange: (registerId: string) => void;
  operationsHealth: OperationsHealthResponse | null;
  operationsHealthErrorText: string | null;
  registers: RegisterRow[];
  reportKpis: ReportKpis;
  reportRange: ReportRange;
  reportRegisterId: string;
  sessions: ReportSession[];
  sessionsErrorText: string | null;
  topProducts: TopProduct[];
  topProductsErrorText: string | null;
  profitabilityReport: {
    summary: {
      margin: number;
      totalCost: number;
      totalProfit: number;
      totalRevenue: number;
    };
    topProducts: Array<{
      productId: string;
      productName: string;
      quantity: number;
      revenue: number;
    }>;
  } | null;
  expiringProducts: Array<{
    barcode: string;
    categoryName?: string;
    expiryDate?: string;
    id: string;
    name: string;
    stockQuantity: number;
  }>;
  ledgerSummary: {
    openingBalance: number;
    totalDebt: number;
    totalPayment: number;
    closingBalance: number;
    dueAmount: number;
    last30DaysPayments: number;
    netChange: number;
  } | null;
  toDateTime: (value?: string | null) => string;
  toMoney: (value: number) => string;
}

export function ReportsPage({
  branchComparisonErrorText,
  branchComparisonRows,
  dailyDate,
  dailyReport,
  loadingOperationsHealth,
  loadingReports,
  onApplyRangePreset,
  onDailyDateChange,
  onLoadReports,
  onReportRangeChange,
  onReportRegisterChange,
  operationsHealth,
  operationsHealthErrorText,
  registers,
  reportKpis,
  reportRange,
  reportRegisterId,
  sessions,
  sessionsErrorText,
  topProducts,
  topProductsErrorText,
  profitabilityReport,
  expiringProducts,
  ledgerSummary,
  toDateTime,
  toMoney,
}: ReportsPageProps): React.ReactElement {
  const topProductsPagination = useClientPagination(topProducts, { pageSize: 20 });
  const branchComparisonPagination = useClientPagination(branchComparisonRows, { pageSize: 20 });
  const sessionsPagination = useClientPagination(sessions, { pageSize: 20 });
  const {
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
  } = useOperationsHealthInsights(operationsHealth);

  const exportOperationsHealthCsv = (): void => {
    if (!operationsHealth || registerHealthMatrix.length === 0) {
      return;
    }
    downloadCsv(
      'operations-health-registers.csv',
      [
        'Sube',
        'Kasa',
        'SLASeviye',
        'Neden',
        'PendingQueue',
        'FailedQueue',
        'SyncLagMin',
        'QueuePeak',
        'OldestPendingSec',
        'LastHeartbeatAt',
        'LastErrorCode',
        'Replay24h',
        'Failed24h',
      ],
      registerHealthMatrix.map((row) => [
        row.branchName,
        row.registerName,
        row.severity,
        row.reasons,
        row.pendingQueueCount,
        row.failedQueueCount,
        row.syncLagMinutes ?? '-',
        row.queuePeak,
        row.oldestPendingAgeSec ?? '-',
        row.lastHeartbeatAt ?? '-',
        row.lastSyncErrorCode ?? '-',
        row.replayed24h,
        row.failed24h,
      ]),
    );
  };

  const exportTopProductsCsv = (): void => {
    downloadCsv(
      'reports-top-products.csv',
      ['Urun', 'Adet', 'Miktar', 'Ciro'],
      topProducts.map((item) => [item.productName, item.count, item.totalQuantity, item.totalRevenue]),
    );
  };

  const exportBranchComparisonCsv = (): void => {
    downloadCsv(
      'reports-branch-comparison.csv',
      ['Sube', 'SatisAdedi', 'IadeAdedi', 'ToplamSatis', 'ToplamIade', 'NetSatis', 'ToplamKDV'],
      branchComparisonRows.map((row) => [
        row.branchName,
        row.salesCount,
        row.refundsCount,
        row.totalSales,
        row.totalRefunds,
        row.netSales,
        row.totalVat,
      ]),
    );
  };

  const exportSessionsCsv = (): void => {
    downloadCsv(
      'reports-register-sessions.csv',
      ['Kasa', 'Kullanici', 'Durum', 'Acilis', 'Kapanis', 'Fark', 'KapanisTarihi'],
      sessions.map((session) => [
        session.register.name,
        session.user.fullName,
        session.status,
        session.openingBalance,
        session.closingBalance ?? 0,
        session.difference ?? 0,
        toDateTime(session.closedAt ?? session.createdAt),
      ]),
    );
  };
  const replayRate24h = operationsHealth?.summary.replayRate24h ?? 0;
  const failed24hTotal = operationsHealth?.summary.failed24hTotal ?? 0;
  const staleHeartbeatRegisters = operationsHealth?.summary.staleHeartbeatRegisters ?? 0;
  const degradedRegisters = operationsHealth?.summary.degradedRegisters ?? 0;

  return (
    <section className="panel-grid">
      <article className="card">
        <h2>Rapor Filtreleri</h2>
        <div className="inline-row three">
          <label>
            Gunluk tarih
            <input type="date" value={dailyDate} onChange={(event) => onDailyDateChange(event.target.value)} />
          </label>
          <label>
            Baslangic
            <input
              type="date"
              value={reportRange.from}
              onChange={(event) => onReportRangeChange((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label>
            Bitis
            <input
              type="date"
              value={reportRange.to}
              onChange={(event) => onReportRangeChange((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
        </div>
        <div className="inline-row three">
          <button className="btn" type="button" onClick={() => onApplyRangePreset('day')}>
            Bugun
          </button>
          <button className="btn" type="button" onClick={() => onApplyRangePreset('week')}>
            Son 7 Gun
          </button>
          <button className="btn" type="button" onClick={() => onApplyRangePreset('month')}>
            Bu Ay
          </button>
        </div>
        <div className="inline-row two">
          <label>
            Kasa (opsiyonel)
            <select value={reportRegisterId} onChange={(event) => onReportRegisterChange(event.target.value)}>
              <option value="">Tum kasalar</option>
              {registers.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name}
                </option>
              ))}
            </select>
          </label>
          <div className="report-action">
            <button className="btn primary" type="button" onClick={onLoadReports} disabled={loadingReports}>
              {loadingReports ? 'Yukleniyor...' : 'Raporu Getir'}
            </button>
          </div>
        </div>
      </article>

      <article className="card">
        <h2>Operasyon KPI Ozeti</h2>
        <div className="metric-grid">
          <div className="metric-card">
            <span>Ort. Fis Tutari (Gunluk)</span>
            <strong>{toMoney(reportKpis.averageTicket)}</strong>
          </div>
          <div className="metric-card">
            <span>Oturum Brut Ciro</span>
            <strong>{toMoney(reportKpis.sessionGrossSales)}</strong>
          </div>
          <div className="metric-card">
            <span>Oturum Toplam Iade</span>
            <strong>{toMoney(reportKpis.sessionRefundTotal)}</strong>
          </div>
          <div className="metric-card">
            <span>Oturum Net Satis</span>
            <strong>{toMoney(reportKpis.sessionNetSales)}</strong>
          </div>
          <div className="metric-card">
            <span>Kritik Stok Urunu</span>
            <strong>{reportKpis.criticalStockCount}</strong>
          </div>
          <div className="metric-card">
            <span>Sube Lideri (Net)</span>
            <strong>{branchComparisonRows[0]?.branchName ?? '-'}</strong>
          </div>
        </div>
      </article>

      <article className="card">
        <h2>Finans Cari Ozeti</h2>
        {ledgerSummary ? (
          <div className="metric-grid">
            <div className="metric-card">
              <span>Donem Basi Bakiye</span>
              <strong>{toMoney(ledgerSummary.openingBalance)}</strong>
            </div>
            <div className="metric-card">
              <span>Donem Borc</span>
              <strong>{toMoney(ledgerSummary.totalDebt)}</strong>
            </div>
            <div className="metric-card">
              <span>Donem Odeme</span>
              <strong>{toMoney(ledgerSummary.totalPayment)}</strong>
            </div>
            <div className="metric-card">
              <span>Kapanis Bakiye</span>
              <strong>{toMoney(ledgerSummary.closingBalance)}</strong>
            </div>
            <div className="metric-card">
              <span>Vadesi Gecmis</span>
              <strong>{toMoney(ledgerSummary.dueAmount)}</strong>
            </div>
            <div className="metric-card">
              <span>Son 30 Gun Odeme</span>
              <strong>{toMoney(ledgerSummary.last30DaysPayments)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">Finans ozeti icin raporu getir.</p>
        )}
      </article>

      {profitabilityReport && (
        <article className="card">
          <h2>Karlilik Analizi Ozeti</h2>
          <div className="metric-grid">
            <div className="metric-card primary">
              <span>Toplam Ciro</span>
              <strong>{toMoney(profitabilityReport.summary.totalRevenue)}</strong>
            </div>
            <div className="metric-card">
              <span>Toplam Maliyet</span>
              <strong>{toMoney(profitabilityReport.summary.totalCost)}</strong>
            </div>
            <div className="metric-card success">
              <span>Toplam Kar</span>
              <strong>{toMoney(profitabilityReport.summary.totalProfit)}</strong>
            </div>
            <div className="metric-card highlight">
              <span>Ortalama Marj</span>
              <strong>%{profitabilityReport.summary.margin.toFixed(2)}</strong>
            </div>
          </div>
          <h3 style={{ marginTop: '1rem' }}>En Karli Urunler Dağılımı</h3>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ width: '300px', height: '300px' }}>
              <Doughnut
                data={{
                  labels: profitabilityReport.topProducts.map(p => p.productName),
                  datasets: [
                    {
                      label: 'Ciro',
                      data: profitabilityReport.topProducts.map(p => p.revenue),
                      backgroundColor: [
                        '#0d9488', '#0f766e', '#115e59', '#134e4a', '#14b8a6', '#2dd4bf', '#5eead4'
                      ],
                      borderWidth: 0,
                    },
                  ],
                }}
                options={{
                  plugins: {
                    legend: { display: false }
                  },
                  cutout: '70%',
                }}
              />
            </div>
            <div className="table-wrap" style={{ flex: 1, minWidth: '300px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Urun</th>
                    <th>Miktar</th>
                    <th>Ciro</th>
                  </tr>
                </thead>
                <tbody>
                  {profitabilityReport.topProducts.map((item) => (
                    <tr key={item.productId}>
                      <td>{item.productName}</td>
                      <td>{item.quantity}</td>
                      <td>{toMoney(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      )}

      <article className="card">
        <h2>Son Kullanma Tarihi Yaklasan Urunler ({expiringProducts.length})</h2>
        <div className="inline-row two" style={{ marginBottom: '0.7rem' }}>
          <p className="muted">Onumuzdeki 30 gun icinde suresi dolacak urunler.</p>
          <div className="report-action">
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                downloadCsv(
                  'reports-expiring-products.csv',
                  ['Barkod', 'Urun', 'Kategori', 'Stok', 'SKT'],
                  expiringProducts.map((p) => [
                    p.barcode,
                    p.name,
                    p.categoryName ?? '-',
                    p.stockQuantity,
                    p.expiryDate ? new Date(p.expiryDate).toLocaleDateString('tr-TR') : '-',
                  ]),
                );
              }}
              disabled={expiringProducts.length === 0}
            >
              CSV Indir
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKT</th>
                <th>Urun</th>
                <th>Barkod</th>
                <th>Stok</th>
              </tr>
            </thead>
            <tbody>
              {expiringProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>
                    Yakin tarihte suresi dolacak urun bulunmadi.
                  </td>
                </tr>
              ) : (
                expiringProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <span className="state-pill critical">
                        {product.expiryDate ? new Date(product.expiryDate).toLocaleDateString('tr-TR') : '-'}
                      </span>
                    </td>
                    <td>{product.name}</td>
                    <td>{product.barcode}</td>
                    <td>{product.stockQuantity}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Firma / Sube / Kasa Saglik Ozeti</h2>
        {operationsHealth && (
          <div className={`banner ${hasOpsRisk ? 'error' : 'success'}`} style={{ marginTop: '0.6rem' }}>
            {hasOpsRisk
              ? 'Operasyon riski var: offline/failed/stale kasa tespit edildi.'
              : 'Operasyon sagligi iyi: kritik offline veya failed queue yok.'}
            {hasOpsQueuePressure ? ' Kuyruk yogunlugu yuksek, sync hizi izlenmeli.' : ''}
            {failed24hTotal > 0 ? ` Son 24 saatte ${failed24hTotal} failed islem var.` : ''}
            {replayRate24h > 5 ? ` Replay orani %${replayRate24h.toFixed(2)} seviyesinde.` : ''}
          </div>
        )}
        {loadingOperationsHealth ? (
          <p className="muted">Saglik ozeti yukleniyor...</p>
        ) : operationsHealthErrorText ? (
          <p className="muted">{operationsHealthErrorText}</p>
        ) : operationsHealth ? (
          <>
            <p className="muted">
              {operationsHealth.company.name} | Uretim zamani: {toDateTime(operationsHealth.generatedAt)}
            </p>
            <div className="metric-grid">
              <div className="metric-card">
                <span>Sube Sayisi</span>
                <strong>{operationsHealth.summary.branchCount}</strong>
              </div>
              <div className="metric-card">
                <span>Kasa Sayisi</span>
                <strong>{operationsHealth.summary.registerCount}</strong>
              </div>
              <div className="metric-card">
                <span>Online Kasa</span>
                <strong>{operationsHealth.summary.onlineRegisters}</strong>
              </div>
              <div className="metric-card">
                <span>Offline Kasa</span>
                <strong>{operationsHealth.summary.offlineRegisters}</strong>
              </div>
              <div className="metric-card">
                <span>Kuyruk Bekleyen</span>
                <strong>{operationsHealth.summary.pendingQueueTotal}</strong>
              </div>
              <div className="metric-card">
                <span>Kuyruk Hata/Conflict</span>
                <strong>{operationsHealth.summary.failedQueueTotal}</strong>
              </div>
              <div className="metric-card">
                <span>Queue Peak Max</span>
                <strong>{operationsHealth.summary.queuePeakMax ?? 0}</strong>
              </div>
              <div className="metric-card">
                <span>Oldest Pending Max</span>
                <strong>
                  {typeof operationsHealth.summary.oldestPendingAgeSecMax === 'number'
                    ? `${operationsHealth.summary.oldestPendingAgeSecMax} sn`
                    : '-'}
                </strong>
              </div>
              <div className="metric-card">
                <span>Replay Rate 24h</span>
                <strong>%{replayRate24h.toFixed(2)}</strong>
              </div>
              <div className="metric-card">
                <span>Stale Register</span>
                <strong>{staleHeartbeatRegisters}</strong>
              </div>
              <div className="metric-card">
                <span>Degraded Register</span>
                <strong>{degradedRegisters}</strong>
              </div>
              <div className="metric-card">
                <span>Accepted / Replayed / Failed 24h</span>
                <strong>
                  {(operationsHealth.summary.accepted24hTotal ?? 0)} / {operationsHealth.summary.replayed24hTotal ?? 0} /{' '}
                  {failed24hTotal}
                </strong>
              </div>
              <div className="metric-card">
                <span>SLA Critical Kasa</span>
                <strong>{matrixSummary.critical}</strong>
              </div>
              <div className="metric-card">
                <span>SLA Warn Kasa</span>
                <strong>{matrixSummary.warn}</strong>
              </div>
            </div>

            <div className="inline-row two" style={{ marginBottom: '0.7rem' }}>
              <p className="muted">
                Kasa bazli saglik kayitlarini CSV olarak disa alabilirsiniz.
              </p>
              <div className="report-action">
                <button className="btn ghost" type="button" onClick={exportOperationsHealthCsv}>
                  Saglik CSV
                </button>
              </div>
            </div>

            <div className="legacy-filter-box" style={{ marginBottom: '0.7rem' }}>
              <h3>SLA Esik Ayarlari</h3>
              <div className="inline-row three">
                <label>
                  Max Pending Queue / Kasa
                  <input
                    min={0}
                    step={1}
                    type="number"
                    value={slaMaxPendingQueue}
                    onChange={(event) => setSlaMaxPendingQueue(event.target.value)}
                  />
                </label>
                <label>
                  Max Failed Queue / Kasa
                  <input
                    min={0}
                    step={1}
                    type="number"
                    value={slaMaxFailedQueue}
                    onChange={(event) => setSlaMaxFailedQueue(event.target.value)}
                  />
                </label>
                <label>
                  Max Sync Gecikmesi (dk)
                  <input
                    min={1}
                    step={1}
                    type="number"
                    value={slaMaxSyncLagMinutes}
                    onChange={(event) => setSlaMaxSyncLagMinutes(event.target.value)}
                  />
                </label>
              </div>
              <p className="muted">
                Aktif esikler: Pending {safePendingThreshold}, Failed {safeFailedThreshold}, Sync Lag{' '}
                {safeSyncLagThresholdMinutes} dk
              </p>
            </div>

            <div className="table-wrap" style={{ marginBottom: '0.7rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Sube</th>
                    <th>Kasa</th>
                    <th>SLA</th>
                    <th>Neden</th>
                    <th>Pending</th>
                    <th>Failed</th>
                    <th>Sync Lag</th>
                  </tr>
                </thead>
                <tbody>
                  {registerHealthMatrix.map((row) => (
                    <tr key={`${row.branchName}:${row.registerName}`}>
                      <td>{row.branchName}</td>
                      <td>{row.registerName}</td>
                      <td>
                        <span
                          className={`state-pill ${
                            row.severity === 'CRITICAL' ? 'critical' : row.severity === 'WARN' ? 'warn' : 'ok'
                          }`}
                        >
                          {row.severity}
                        </span>
                      </td>
                      <td>{row.reasons}</td>
                      <td>{row.pendingQueueCount}</td>
                      <td>{row.failedQueueCount}</td>
                      <td>{typeof row.syncLagMinutes === 'number' ? `${row.syncLagMinutes} dk` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sube</th>
                    <th>Kasa</th>
                    <th>Durum</th>
                    <th>Kuyruk</th>
                    <th>Queue Peak</th>
                    <th>Oldest Pending</th>
                    <th>Son Heartbeat</th>
                    <th>Last Error</th>
                    <th>Replay/Failed 24h</th>
                    <th>Son Sync</th>
                    <th>Son Oturum Guncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {operationsHealth.branches.flatMap((branch) =>
                    branch.registers.map((register) => (
                      <tr key={`${branch.id}:${register.id}`}>
                        <td>{branch.name}</td>
                        <td>{register.name}</td>
                        <td>
                          <span className={`state-pill ${register.isOnline ? 'ok' : 'off'}`}>
                            {register.isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </td>
                        <td>
                          P:{register.pendingQueueCount} / F:{register.failedQueueCount}
                        </td>
                        <td>{register.queuePeak ?? 0}</td>
                        <td>
                          {typeof register.oldestPendingAgeSec === 'number'
                            ? `${register.oldestPendingAgeSec} sn`
                            : '-'}
                        </td>
                        <td>{toDateTime(register.lastHeartbeatAt ?? null)}</td>
                        <td>{register.lastSyncErrorCode ?? '-'}</td>
                        <td>
                          {(register.replayed24h ?? 0)} / {(register.failed24h ?? 0)}
                        </td>
                        <td>{toDateTime(register.lastSyncAt)}</td>
                        <td>{toDateTime(register.openSessionUpdatedAt)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">Saglik ozeti icin firma/sube secin.</p>
        )}
      </article>

      {dailyReport && (
        <article className="card">
          <h2>Gunluk Ozet ({dailyReport.date})</h2>
          <div className="metric-grid">
            <div className="metric-card">
              <span>Toplam Satis</span>
              <strong>{toMoney(dailyReport.totalSales)}</strong>
            </div>
            <div className="metric-card">
              <span>Toplam Iade</span>
              <strong>{toMoney(dailyReport.totalRefunds)}</strong>
            </div>
            <div className="metric-card">
              <span>Net Satis</span>
              <strong>{toMoney(dailyReport.netSales)}</strong>
            </div>
            <div className="metric-card">
              <span>KDV</span>
              <strong>{toMoney(dailyReport.totalVat)}</strong>
            </div>
            <div className="metric-card">
              <span>Satis Adedi</span>
              <strong>{dailyReport.salesCount}</strong>
            </div>
            <div className="metric-card">
              <span>Iade Adedi</span>
              <strong>{dailyReport.refundsCount}</strong>
            </div>
          </div>

          <h3>Odeme Dagilimi</h3>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div className="table-wrap" style={{ flex: 1, minWidth: '250px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Yontem</th>
                    <th>Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyReport.paymentBreakdown.map((item) => (
                    <tr key={item.method}>
                      <td>{item.method}</td>
                      <td>{toMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ flex: 1, minWidth: '300px', height: '200px' }}>
              <Bar 
                data={{
                  labels: dailyReport.paymentBreakdown.map(p => p.method),
                  datasets: [{
                    label: 'Tutar',
                    data: dailyReport.paymentBreakdown.map(p => p.total),
                    backgroundColor: '#0d9488',
                    borderRadius: 4
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      grid: { color: '#374151' },
                      ticks: { color: '#9ca3af' }
                    },
                    x: {
                      grid: { display: false },
                      ticks: { color: '#9ca3af' }
                    }
                  }
                }}
              />
            </div>
          </div>
        </article>
      )}

      <article className="card">
        <h2>En Cok Satan Urunler ({topProductsPagination.total})</h2>
        <div className="inline-row two" style={{ marginBottom: '0.7rem' }}>
          <p className="muted">Toplam {topProducts.length} urun satirini disa aktarir.</p>
          <div className="report-action">
            <button className="btn ghost" type="button" onClick={exportTopProductsCsv} disabled={topProducts.length === 0}>
              CSV Indir
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Urun</th>
                <th>Adet</th>
                <th>Miktar</th>
                <th>Ciro</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={4}
                emptyText="Urun performans kaydi bulunmadi."
                errorText={topProductsErrorText}
                loading={loadingReports}
                rowCount={topProductsPagination.total}
              />
              {topProductsPagination.visibleRows.map((item) => (
                <tr key={item.productId}>
                  <td>{item.productName}</td>
                  <td>{item.count}</td>
                  <td>{item.totalQuantity}</td>
                  <td>{toMoney(item.totalRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          onPageChange={topProductsPagination.setPage}
          page={topProductsPagination.page}
          pageSize={topProductsPagination.pageSize}
          total={topProductsPagination.total}
        />
      </article>

      <article className="card">
        <h2>Sube Karsilastirma ({branchComparisonPagination.total})</h2>
        <div className="inline-row two" style={{ marginBottom: '0.7rem' }}>
          <p className="muted">Sube bazli net performans verisini disa aktarir.</p>
          <div className="report-action">
            <button
              className="btn ghost"
              type="button"
              onClick={exportBranchComparisonCsv}
              disabled={branchComparisonRows.length === 0}
            >
              CSV Indir
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sube</th>
                <th>Satis Adedi</th>
                <th>Iade Adedi</th>
                <th>Toplam Satis</th>
                <th>Toplam Iade</th>
                <th>Net</th>
                <th>KDV</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                emptyText="Sube karsilastirma verisi bulunmadi."
                errorText={branchComparisonErrorText}
                loading={loadingReports}
                rowCount={branchComparisonPagination.total}
              />
              {branchComparisonPagination.visibleRows.map((row) => (
                <tr key={row.branchId}>
                  <td>{row.branchName}</td>
                  <td>{row.salesCount}</td>
                  <td>{row.refundsCount}</td>
                  <td>{toMoney(row.totalSales)}</td>
                  <td>{toMoney(row.totalRefunds)}</td>
                  <td>{toMoney(row.netSales)}</td>
                  <td>{toMoney(row.totalVat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          onPageChange={branchComparisonPagination.setPage}
          page={branchComparisonPagination.page}
          pageSize={branchComparisonPagination.pageSize}
          total={branchComparisonPagination.total}
        />
      </article>

      <article className="card">
        <h2>Kasa Oturumlari ({sessionsPagination.total})</h2>
        <div className="inline-row two" style={{ marginBottom: '0.7rem' }}>
          <p className="muted">Kasa oturum hareketlerinin tam listesini disa aktarir.</p>
          <div className="report-action">
            <button className="btn ghost" type="button" onClick={exportSessionsCsv} disabled={sessions.length === 0}>
              CSV Indir
            </button>
          </div>
        </div>
        <div className="table-wrap tall">
          <table>
            <thead>
              <tr>
                <th>Kasa</th>
                <th>Kullanici</th>
                <th>Durum</th>
                <th>Acilis</th>
                <th>Kapanis</th>
                <th>Fark</th>
                <th>Kapanis Tarihi</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                emptyText="Kasa oturumu kaydi bulunmadi."
                errorText={sessionsErrorText}
                loading={loadingReports}
                rowCount={sessionsPagination.total}
              />
              {sessionsPagination.visibleRows.map((session) => (
                <tr key={session.id}>
                  <td>{session.register.name}</td>
                  <td>{session.user.fullName}</td>
                  <td>{session.status}</td>
                  <td>{toMoney(session.openingBalance)}</td>
                  <td>{toMoney(session.closingBalance ?? 0)}</td>
                  <td>{toMoney(session.difference ?? 0)}</td>
                  <td>{toDateTime(session.closedAt ?? session.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          onPageChange={sessionsPagination.setPage}
          page={sessionsPagination.page}
          pageSize={sessionsPagination.pageSize}
          total={sessionsPagination.total}
        />
      </article>
    </section>
  );
}
