import React from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { TableState } from '../components/TableState';
import { useClientPagination } from '../hooks/use-client-pagination';

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

interface OperationsHealthResponse {
  company: { name: string };
  generatedAt: string;
  summary: {
    branchCount: number;
    failedQueueTotal: number;
    offlineRegisters: number;
    onlineRegisters: number;
    pendingQueueTotal: number;
    registerCount: number;
  };
  branches: Array<{
    id: string;
    name: string;
    registers: Array<{
      id: string;
      name: string;
      isOnline: boolean;
      lastSyncAt: string | null;
      openSessionUpdatedAt: string | null;
      pendingQueueCount: number;
      failedQueueCount: number;
    }>;
  }>;
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
  toDateTime,
  toMoney,
}: ReportsPageProps): React.ReactElement {
  const topProductsPagination = useClientPagination(topProducts, { pageSize: 20 });
  const branchComparisonPagination = useClientPagination(branchComparisonRows, { pageSize: 20 });
  const sessionsPagination = useClientPagination(sessions, { pageSize: 20 });

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
        <h2>Firma / Sube / Kasa Saglik Ozeti</h2>
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
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sube</th>
                    <th>Kasa</th>
                    <th>Durum</th>
                    <th>Kuyruk</th>
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
          <div className="table-wrap">
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
        </article>
      )}

      <article className="card">
        <h2>En Cok Satan Urunler ({topProductsPagination.total})</h2>
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
