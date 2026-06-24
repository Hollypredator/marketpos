import React from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { TableState } from '../components/TableState';
import { useClientPagination } from '../hooks/use-client-pagination';

type SubscriptionStatus = 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'SUSPENDED' | 'UNCONFIGURED';
type SubscriptionSort = 'DUE_ASC' | 'DUE_DESC' | 'NAME_ASC' | 'STATUS';

interface SubscriptionFilters {
  dueInDays: string;
  search: string;
  status: '' | SubscriptionStatus;
}

interface SubscriptionPlanForm {
  note: string;
  packageExpiresAt: string;
  packageGraceDays: string;
  packageStartedAt: string;
  packageStatus: 'ACTIVE' | 'SUSPENDED';
}

interface SubscriptionSummary {
  ACTIVE: number;
  EXPIRED: number;
  GRACE: number;
  SUSPENDED: number;
  UNCONFIGURED: number;
}

interface SubscriptionCompanyRow {
  company: {
    id: string;
    name: string;
    taxNumber?: string | null;
    packageExpiresAt?: string | null;
    packageGraceEndsAt?: string | null;
    packageStatus: 'ACTIVE' | 'SUSPENDED';
    licenseKey?: string | null;
  };
  access: {
    daysRemaining: number | null;
    status: SubscriptionStatus;
  };
  lastAuditAt: string | null;
}

interface SubscriptionAuditRow {
  id: string;
  actorType: 'USER' | 'SYSTEM';
  createdAt: string;
  eventType:
    | 'RENEW_QUICK'
    | 'RENEW_MANUAL'
    | 'SUSPEND_MANUAL'
    | 'UNSUSPEND_MANUAL'
    | 'SYSTEM_ENTER_GRACE'
    | 'SYSTEM_BLOCK_EXPIRED'
    | 'SYSTEM_RESTORE_ACTIVE';
  nextStatus: SubscriptionStatus;
  note?: string | null;
  previousStatus: SubscriptionStatus | null;
  actorUser?: {
    fullName: string;
    username: string;
  } | null;
}

interface SubscriptionAuditPagination {
  page: number;
  total: number;
  totalPages: number;
}

interface SubscriptionPageProps {
  actionNote: string;
  auditErrorText: string | null;
  auditLoading: boolean;
  auditPagination: SubscriptionAuditPagination;
  auditRows: SubscriptionAuditRow[];
  dueLimit: number;
  filters: SubscriptionFilters;
  onActionNoteChange: (value: string) => void;
  onApplyFilters: () => void;
  onExportUpcoming: () => void;
  onExportWholeList: () => void;
  onFiltersChange: (updater: (current: SubscriptionFilters) => SubscriptionFilters) => void;
  onPlanFormChange: (updater: (current: SubscriptionPlanForm) => SubscriptionPlanForm) => void;
  onQuickRenew: (companyId: string) => void;
  onQuickRenewSelected: () => void;
  onReloadAudit: () => void;
  onResetFilters: () => void;
  onSavePlan: (event: React.FormEvent<HTMLFormElement>) => void;
  onSelectCompany: (companyId: string) => void;
  onSortChange: (sort: SubscriptionSort) => void;
  onSuspend: (companyId: string) => void;
  onUnsuspend: (companyId: string) => void;
  onGenerateLicenseKey: (companyId: string) => void;
  planForm: SubscriptionPlanForm;
  rows: SubscriptionCompanyRow[];
  saving: boolean;
  selectedRow: SubscriptionCompanyRow | null;
  selectedRowId: string;
  sort: SubscriptionSort;
  statuses: readonly SubscriptionStatus[];
  subscriptionErrorText: string | null;
  subscriptionLoading: boolean;
  summary: SubscriptionSummary;
  toDateTime: (value?: string | null) => string;
  upcomingRenewals: SubscriptionCompanyRow[];
}

export function SubscriptionPage({
  actionNote,
  auditErrorText,
  auditLoading,
  auditPagination,
  auditRows,
  dueLimit,
  filters,
  onActionNoteChange,
  onApplyFilters,
  onExportUpcoming,
  onExportWholeList,
  onFiltersChange,
  onPlanFormChange,
  onQuickRenew,
  onQuickRenewSelected,
  onReloadAudit,
  onResetFilters,
  onSavePlan,
  onSelectCompany,
  onSortChange,
  onSuspend,
  onUnsuspend,
  onGenerateLicenseKey,
  planForm,
  rows,
  saving,
  selectedRow,
  selectedRowId,
  sort,
  statuses,
  subscriptionErrorText,
  subscriptionLoading,
  summary,
  toDateTime,
  upcomingRenewals,
}: SubscriptionPageProps): React.ReactElement {
  const upcomingPagination = useClientPagination(upcomingRenewals, { pageSize: 20 });
  const rowsPagination = useClientPagination(rows, { pageSize: 20 });
  const auditRowsPagination = useClientPagination(auditRows, { pageSize: 20 });

  return (
    <section className="panel-grid">
      <article className="card">
        <h2>Paket Takip</h2>
        <p className="muted">Yillik yenileme takibi, askiya alma ve manuel paket plan duzenleme islemleri.</p>
        <div className="inline-row three">
          <label>
            Durum
            <select
              value={filters.status}
              onChange={(event) =>
                onFiltersChange((current) => ({
                  ...current,
                  status: event.target.value as '' | SubscriptionStatus,
                }))
              }
            >
              <option value="">Tum durumlar</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Yaklasan vade (gun)
            <input
              type="number"
              min="0"
              value={filters.dueInDays}
              onChange={(event) =>
                onFiltersChange((current) => ({
                  ...current,
                  dueInDays: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Arama
            <input
              placeholder="Firma adi veya vergi no"
              value={filters.search}
              onChange={(event) =>
                onFiltersChange((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="inline-row three">
          <button className="btn" type="button" onClick={onApplyFilters} disabled={subscriptionLoading}>
            {subscriptionLoading ? 'Yukleniyor...' : 'Filtreyi Uygula'}
          </button>
          <button className="btn primary" type="button" onClick={onApplyFilters} disabled={subscriptionLoading}>
            Listeyi Yenile
          </button>
          <button className="btn" type="button" onClick={onResetFilters} disabled={subscriptionLoading}>
            Filtreyi Sifirla
          </button>
        </div>
        <div className="inline-row three" style={{ marginTop: '8px' }}>
          <label>
            Siralama
            <select value={sort} onChange={(event) => onSortChange(event.target.value as SubscriptionSort)}>
              <option value="DUE_ASC">Kalan Gun (artan)</option>
              <option value="DUE_DESC">Kalan Gun (azalan)</option>
              <option value="NAME_ASC">Firma Adi (A-Z)</option>
              <option value="STATUS">Runtime Durum</option>
            </select>
          </label>
          <button className="btn" type="button" onClick={onExportWholeList}>
            Listeyi CSV Disa Aktar
          </button>
          <button className="btn" type="button" onClick={onExportUpcoming}>
            Yaklasan Vade CSV
          </button>
        </div>
        <div className="metric-grid">
          <div className="metric-card">
            <span>ACTIVE</span>
            <strong>{summary.ACTIVE}</strong>
          </div>
          <div className="metric-card">
            <span>GRACE</span>
            <strong>{summary.GRACE}</strong>
          </div>
          <div className="metric-card">
            <span>EXPIRED</span>
            <strong>{summary.EXPIRED}</strong>
          </div>
          <div className="metric-card">
            <span>SUSPENDED</span>
            <strong>{summary.SUSPENDED}</strong>
          </div>
          <div className="metric-card">
            <span>UNCONFIGURED</span>
            <strong>{summary.UNCONFIGURED}</strong>
          </div>
        </div>
      </article>

      <article className="card">
        <h2>Yaklasan Yenileme Listesi ({upcomingPagination.total})</h2>
        <p className="muted">Son {dueLimit} gun icinde yenileme beklenen firmalar.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Firma</th>
                <th>Runtime</th>
                <th>Kalan Gun</th>
                <th>Paket Bitis</th>
                <th>Son Audit</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={5}
                emptyText="Filtreye gore yaklasan yenileme kaydi bulunmadi."
                errorText={subscriptionErrorText}
                loading={subscriptionLoading}
                rowCount={upcomingPagination.total}
              />
              {upcomingPagination.visibleRows.map((row) => (
                <tr key={`due:${row.company.id}`}>
                  <td>{row.company.name}</td>
                  <td>{row.access.status}</td>
                  <td>{row.access.daysRemaining ?? '-'}</td>
                  <td>{toDateTime(row.company.packageExpiresAt)}</td>
                  <td>{toDateTime(row.lastAuditAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          onPageChange={upcomingPagination.setPage}
          page={upcomingPagination.page}
          pageSize={upcomingPagination.pageSize}
          total={upcomingPagination.total}
        />
      </article>

      <article className="card">
        <h2>Paket Durum Listesi ({rowsPagination.total})</h2>
        <div className="table-wrap tall">
          <table>
            <thead>
              <tr>
                <th>Firma</th>
                <th>Runtime Durum</th>
                <th>Kalan Gun</th>
                <th>Bitis</th>
                <th>Grace Sonu</th>
                <th>Paket Durumu</th>
                <th>Islem</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                emptyText="Paket listesinde kayit bulunmadi."
                errorText={subscriptionErrorText}
                loading={subscriptionLoading}
                rowCount={rowsPagination.total}
              />
              {rowsPagination.visibleRows.map((row) => (
                <tr key={row.company.id} className={selectedRowId === row.company.id ? 'row-selected' : ''}>
                  <td>
                    <div className="stacked-row">
                      <span>{row.company.name}</span>
                      <small>
                        {row.company.taxNumber ?? 'Vergi no yok'}
                        {row.company.licenseKey && ` | Lisans: ${row.company.licenseKey}`}
                      </small>
                    </div>
                  </td>
                  <td>{row.access.status}</td>
                  <td>{row.access.daysRemaining ?? '-'}</td>
                  <td>{toDateTime(row.company.packageExpiresAt)}</td>
                  <td>{toDateTime(row.company.packageGraceEndsAt)}</td>
                  <td>{row.company.packageStatus}</td>
                  <td>
                    <div className="subscription-action-row">
                      <button className="btn" type="button" onClick={() => onSelectCompany(row.company.id)}>
                        Detay
                      </button>
                      <button
                        className="btn primary"
                        type="button"
                        onClick={() => onQuickRenew(row.company.id)}
                        disabled={saving}
                      >
                        Hizli Yenile
                      </button>
                      {row.company.packageStatus === 'SUSPENDED' ? (
                        <button className="btn" type="button" onClick={() => onUnsuspend(row.company.id)} disabled={saving}>
                          Askidan Cikar
                        </button>
                      ) : (
                        <button className="btn danger" type="button" onClick={() => onSuspend(row.company.id)} disabled={saving}>
                          Askiya Al
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          onPageChange={rowsPagination.setPage}
          page={rowsPagination.page}
          pageSize={rowsPagination.pageSize}
          total={rowsPagination.total}
        />

        <label style={{ marginTop: '10px' }}>
          Islem Notu (askiya alma / askidan cikarma icin zorunlu)
          <input
            placeholder="Ornek: Odeme gecikmesi nedeniyle gecici olarak askiya alindi."
            value={actionNote}
            onChange={(event) => onActionNoteChange(event.target.value)}
          />
        </label>
      </article>

      <section className="panel-grid two-col">
        <article className="card">
          <h2>Secili Firma Plani</h2>
          {selectedRow ? (
            <form className="form-grid compact" onSubmit={onSavePlan}>
              <p className="muted">
                {selectedRow.company.name} | Runtime: {selectedRow.access.status}
                {selectedRow.company.licenseKey && ` | Lisans: ${selectedRow.company.licenseKey}`}
              </p>
              <div style={{ marginBottom: '12px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => onGenerateLicenseKey(selectedRow.company.id)}
                  disabled={saving}
                >
                  Yeni Lisans Kodu Üret
                </button>
              </div>
              <div className="inline-row two">
                <label>
                  Paket durumu
                  <select
                    value={planForm.packageStatus}
                    onChange={(event) =>
                      onPlanFormChange((current) => ({
                        ...current,
                        packageStatus: event.target.value as 'ACTIVE' | 'SUSPENDED',
                      }))
                    }
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </label>
                <label>
                  Grace gunu
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={planForm.packageGraceDays}
                    onChange={(event) =>
                      onPlanFormChange((current) => ({
                        ...current,
                        packageGraceDays: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="inline-row two">
                <label>
                  Paket baslangici
                  <input
                    type="date"
                    value={planForm.packageStartedAt}
                    onChange={(event) =>
                      onPlanFormChange((current) => ({
                        ...current,
                        packageStartedAt: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Paket bitisi
                  <input
                    type="date"
                    value={planForm.packageExpiresAt}
                    onChange={(event) =>
                      onPlanFormChange((current) => ({
                        ...current,
                        packageExpiresAt: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                Manuel duzenleme notu (zorunlu)
                <input
                  placeholder="Ornek: Kredi karti tahsilati alindi, sozlesme 1 yil uzatildi."
                  value={planForm.note}
                  onChange={(event) =>
                    onPlanFormChange((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                />
              </label>
              <button className="btn primary" type="submit" disabled={saving}>
                Manuel Duzenlemeyi Kaydet
              </button>
            </form>
          ) : (
            <p className="muted">Listeden bir firma secin.</p>
          )}
        </article>

        <article className="card">
          <h2>Paket Audit Gecmisi ({auditRowsPagination.total})</h2>
          <p className="muted">
            Sayfa: {auditRowsPagination.page} / {auditRowsPagination.totalPages} | Toplam: {auditPagination.total}
          </p>
          <div className="action-row">
            <button className="btn" type="button" onClick={onReloadAudit} disabled={!selectedRow || auditLoading}>
              {auditLoading ? 'Yukleniyor...' : 'Audit Yenile'}
            </button>
            <button className="btn primary" type="button" onClick={onQuickRenewSelected} disabled={!selectedRow || saving}>
              Secili Firmayi Hizli Yenile
            </button>
          </div>
          <div className="table-wrap tall">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Durum</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                <TableState
                  colSpan={5}
                  emptyText="Audit kaydi bulunmadi."
                  errorText={auditErrorText}
                  loading={auditLoading}
                  rowCount={auditRowsPagination.total}
                />
                {auditRowsPagination.visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>{toDateTime(row.createdAt)}</td>
                    <td>{row.eventType}</td>
                    <td>
                      {row.actorType === 'SYSTEM' ? 'SYSTEM' : `${row.actorUser?.fullName ?? '-'} (${row.actorUser?.username ?? '-'})`}
                    </td>
                    <td>
                      {row.previousStatus ?? '-'} {' -> '} {row.nextStatus}
                    </td>
                    <td>{row.note?.trim() ? row.note : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            onPageChange={auditRowsPagination.setPage}
            page={auditRowsPagination.page}
            pageSize={auditRowsPagination.pageSize}
            total={auditRowsPagination.total}
          />
        </article>
      </section>
    </section>
  );
}
