import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { PaginationControls } from '../components/PaginationControls';
import { TableState } from '../components/TableState';
import { useClientPagination } from '../hooks/use-client-pagination';
import { useCompanyMutations } from '../domain/organization/hooks';
import { useSubscriptionMutations } from '../domain/subscription/hooks';
import { queryKeys } from '../lib/query-keys';

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
    licenseKeyActivatedAt?: string | null;
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
  const [activationFilter, setActivationFilter] = useState<'ALL' | 'UNACTIVATED' | 'ACTIVATED'>('ALL');
  const [sidebarTab, setSidebarTab] = useState<'PLAN' | 'CREATE'>('CREATE');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Tenant Creator Form fields
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyTaxNumber, setNewCompanyTaxNumber] = useState('');
  const [newCompanyEmail, setNewCompanyEmail] = useState('');
  const [newCompanyPhone, setNewCompanyPhone] = useState('');
  const [newCompanyAddress, setNewCompanyAddress] = useState('');

  const [generatedLicenseInfo, setGeneratedLicenseInfo] = useState<{
    companyName: string;
    licenseKey: string;
  } | null>(null);

  const queryClient = useQueryClient();
  const { createCompany } = useCompanyMutations('');
  const { generateLicense } = useSubscriptionMutations(filters, selectedRowId);

  const handleCopy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const handleCreateTenant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCompanyName.trim()) return;

    try {
      // 1. Create company/tenant
      const createdCompany = await createCompany.mutateAsync({
        name: newCompanyName.trim(),
        taxNumber: newCompanyTaxNumber.trim(),
        email: newCompanyEmail.trim(),
        phone: newCompanyPhone.trim(),
        address: newCompanyAddress.trim(),
        maxCartDiscountPercent: '25',
        maxItemDiscountPercent: '40',
      });

      // 2. Generate license key for this company
      const licenseKey = await generateLicense.mutateAsync(createdCompany.id);

      // Invalidate query to show the new company in the table list
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptionCompanies(filters),
      });

      // 3. Show success info modal
      setGeneratedLicenseInfo({
        companyName: createdCompany.name,
        licenseKey,
      });

      // 4. Reset tenant creator form fields
      setNewCompanyName('');
      setNewCompanyTaxNumber('');
      setNewCompanyEmail('');
      setNewCompanyPhone('');
      setNewCompanyAddress('');
    } catch (err: any) {
      alert(err?.message || 'Lisans ve firma oluşturulurken bir hata oluştu.');
    }
  };

  const handleSelectCompanyDetails = (companyId: string) => {
    onSelectCompany(companyId);
    setSidebarTab('PLAN');
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const key = row.company.licenseKey;
      const activated = row.company.licenseKeyActivatedAt;

      if (activationFilter === 'UNACTIVATED') {
        // Bekleyen Lisanslar (Unactivated): licenseKey is present, but licenseKeyActivatedAt is null/empty
        return !!key && !activated;
      }
      if (activationFilter === 'ACTIVATED') {
        // Aktif Abonelikler (Activated): licenseKey is present and licenseKeyActivatedAt is set
        return !!key && !!activated;
      }
      return true; // Tümü
    });
  }, [rows, activationFilter]);

  const upcomingPagination = useClientPagination(upcomingRenewals, { pageSize: 20 });
  const rowsPagination = useClientPagination(filteredRows, { pageSize: 20 });
  const auditRowsPagination = useClientPagination(auditRows, { pageSize: 20 });

  const getStatusBadgeClass = (status: SubscriptionStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'status-badge status-active';
      case 'GRACE':
        return 'status-badge status-grace';
      case 'EXPIRED':
        return 'status-badge status-expired';
      case 'SUSPENDED':
        return 'status-badge status-suspended';
      case 'UNCONFIGURED':
        return 'status-badge status-unconfigured';
      default:
        return 'status-badge';
    }
  };

  const renderLicenseKey = (key?: string | null) => {
    if (!key) return <span className="muted italic" style={{ fontSize: '0.8rem' }}>Lisans Yok</span>;
    const isCopied = copiedKey === key;
    return (
      <div className="license-key-wrapper">
        <code className="license-code">{key}</code>
        <button
          type="button"
          className="copy-btn"
          onClick={() => handleCopy(key)}
          title="Kopyala"
        >
          {isCopied ? (
            <span className="copy-feedback">Kopyalandı!</span>
          ) : (
            <svg className="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
    );
  };

  return (
    <section className="panel-grid">
      {/* Top Banner/Title & Metrics */}
      <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2>Lisans & Abonelik Yönetim Paneli</h2>
            <p className="muted">Firmaların lisans durumlarını izleyin, yeni lisanslar oluşturun ve paket planlarını güncelleyin.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" type="button" onClick={onExportWholeList}>
              Tümünü CSV Dışa Aktar
            </button>
            <button className="btn" type="button" onClick={onExportUpcoming}>
              Yaklaşan Vade CSV
            </button>
          </div>
        </div>

        {/* Metric Grid */}
        <div className="metric-grid" style={{ marginTop: '0' }}>
          <div className="metric-card" style={{ borderLeft: '4px solid #10b981' }}>
            <span>AKTİF (ACTIVE)</span>
            <strong>{summary.ACTIVE}</strong>
          </div>
          <div className="metric-card" style={{ borderLeft: '4px solid #f59e0b' }}>
            <span>EK SÜRE (GRACE)</span>
            <strong>{summary.GRACE}</strong>
          </div>
          <div className="metric-card" style={{ borderLeft: '4px solid #ef4444' }}>
            <span>SÜRESİ DOLMUŞ (EXPIRED)</span>
            <strong>{summary.EXPIRED}</strong>
          </div>
          <div className="metric-card" style={{ borderLeft: '4px solid #6b7280' }}>
            <span>ASKIDA (SUSPENDED)</span>
            <strong>{summary.SUSPENDED}</strong>
          </div>
          <div className="metric-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
            <span>LİSANSSIZ (UNCONFIGURED)</span>
            <strong>{summary.UNCONFIGURED}</strong>
          </div>
        </div>
      </article>

      {/* Main Split Grid */}
      <div className="sub-layout-grid">
        {/* Left Pane (Table lists & audit history) */}
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Main Companies Table Card */}
          <article className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ margin: 0 }}>Firma Abonelik Listesi ({filteredRows.length})</h3>

              {/* Segmented Control for License Key States */}
              <div className="segmented-control" style={{ margin: 0, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', display: 'flex' }}>
                <button
                  type="button"
                  className={`segment ${activationFilter === 'ALL' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => setActivationFilter('ALL')}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  className={`segment ${activationFilter === 'UNACTIVATED' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => setActivationFilter('UNACTIVATED')}
                  title="Lisans kodu üretilmiş ama henüz aktive edilmemiş firmalar"
                >
                  Bekleyen Lisanslar
                </button>
                <button
                  type="button"
                  className={`segment ${activationFilter === 'ACTIVATED' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => setActivationFilter('ACTIVATED')}
                  title="Lisans kodu aktive edilmiş firmalar"
                >
                  Aktif Abonelikler
                </button>
              </div>
            </div>

            {/* List filters (Arama, Durum, Gün) */}
            <div className="inline-row three" style={{ marginBottom: '12px' }}>
              <label>
                Arama
                <input
                  placeholder="Firma adı veya vergi no"
                  value={filters.search}
                  onChange={(event) =>
                    onFiltersChange((current) => ({
                      ...current,
                      search: event.target.value,
                    }))
                  }
                />
              </label>
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
                  <option value="">Tüm durumlar</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Yaklaşan vade (gün)
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
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn primary" type="button" onClick={onApplyFilters} disabled={subscriptionLoading}>
                  {subscriptionLoading ? 'Yükleniyor...' : 'Filtreleri Uygula / Yenile'}
                </button>
                <button className="btn" type="button" onClick={onResetFilters} disabled={subscriptionLoading}>
                  Sıfırla
                </button>
              </div>
              <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                Sıralama:
                <select style={{ minHeight: '34px', width: 'auto' }} value={sort} onChange={(event) => onSortChange(event.target.value as SubscriptionSort)}>
                  <option value="DUE_ASC">Kalan Gün (artan)</option>
                  <option value="DUE_DESC">Kalan Gün (azalan)</option>
                  <option value="NAME_ASC">Firma Adı (A-Z)</option>
                  <option value="STATUS">Runtime Durum</option>
                </select>
              </label>
            </div>

            {/* Table Wrap */}
            <div className="table-wrap tall">
              <table>
                <thead>
                  <tr>
                    <th>Firma Bilgisi</th>
                    <th>Lisans Kodu</th>
                    <th>Runtime Durum</th>
                    <th>Kalan Gün</th>
                    <th>Paket Bitiş</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    colSpan={6}
                    emptyText="Arama kriterlerine uygun firma bulunamadı."
                    errorText={subscriptionErrorText}
                    loading={subscriptionLoading}
                    rowCount={rowsPagination.total}
                  />
                  {rowsPagination.visibleRows.map((row) => (
                    <tr key={row.company.id} className={selectedRowId === row.company.id ? 'row-selected' : ''}>
                      <td>
                        <div className="stacked-row">
                          <span style={{ fontWeight: 700 }}>{row.company.name}</span>
                          <small className="muted">
                            {row.company.taxNumber || 'Vergi no yok'}
                            {row.company.licenseKeyActivatedAt && ` | Aktif: ${toDateTime(row.company.licenseKeyActivatedAt)}`}
                          </small>
                        </div>
                      </td>
                      <td>{renderLicenseKey(row.company.licenseKey)}</td>
                      <td>
                        <span className={getStatusBadgeClass(row.access.status)}>
                          {row.access.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{row.access.daysRemaining ?? '-'}</span>
                      </td>
                      <td>{toDateTime(row.company.packageExpiresAt)}</td>
                      <td>
                        <div className="subscription-action-row" style={{ gap: '6px' }}>
                          <button className="btn" type="button" onClick={() => handleSelectCompanyDetails(row.company.id)}>
                            Plan / Detay
                          </button>
                          <button
                            className="btn primary"
                            type="button"
                            onClick={() => onQuickRenew(row.company.id)}
                            disabled={saving}
                          >
                            Hızlı Yenile
                          </button>
                          {row.company.packageStatus === 'SUSPENDED' ? (
                            <button className="btn" type="button" onClick={() => onUnsuspend(row.company.id)} disabled={saving}>
                              Aktif Et
                            </button>
                          ) : (
                            <button className="btn danger" type="button" onClick={() => onSuspend(row.company.id)} disabled={saving}>
                              Askıya Al
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

            <label style={{ marginTop: '14px' }}>
              İşlem Notu (Askıya alma / çıkarma için zorunludur)
              <input
                placeholder="Örn: Ödeme gecikmesi nedeniyle askıya alındı..."
                value={actionNote}
                onChange={(event) => onActionNoteChange(event.target.value)}
              />
            </label>
          </article>

          {/* Audit History */}
          <article className="card">
            <h3>Paket Audit Geçmişi ({auditRowsPagination.total})</h3>
            <p className="muted">Seçili firmanın paket hareket kayıtları.</p>
            <div className="action-row" style={{ marginTop: '12px', marginBottom: '12px' }}>
              <button className="btn" type="button" onClick={onReloadAudit} disabled={!selectedRow || auditLoading}>
                {auditLoading ? 'Yükleniyor...' : 'Kayıtları Yenile'}
              </button>
              <button className="btn primary" type="button" onClick={onQuickRenewSelected} disabled={!selectedRow || saving}>
                Seçili Firmayı Hızlı Yenile
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>İşlem</th>
                    <th>Aktör</th>
                    <th>Durum Değişimi</th>
                    <th>Açıklama / Not</th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    colSpan={5}
                    emptyText="Geçmiş kaydı bulunmamaktadır. Soldaki listeden bir firma seçin."
                    errorText={auditErrorText}
                    loading={auditLoading}
                    rowCount={auditRowsPagination.total}
                  />
                  {auditRowsPagination.visibleRows.map((row) => (
                    <tr key={row.id}>
                      <td>{toDateTime(row.createdAt)}</td>
                      <td style={{ fontWeight: 600 }}>{row.eventType}</td>
                      <td>
                        {row.actorType === 'SYSTEM' ? 'SYSTEM' : `${row.actorUser?.fullName ?? '-'} (${row.actorUser?.username ?? '-'})`}
                      </td>
                      <td>
                        <span className="muted" style={{ fontSize: '0.85rem' }}>
                          {row.previousStatus ?? '-'}
                        </span>
                        {' → '}
                        <span style={{ fontWeight: 600 }}>{row.nextStatus}</span>
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
        </div>

        {/* Right Pane (Sidebar Tab Panel) */}
        <div style={{ display: 'grid', gap: '16px' }}>
          <article className="card">
            {/* Sidebar Tabs control */}
            <div className="sidebar-tabs">
              <button
                type="button"
                className={`sidebar-tab-btn ${sidebarTab === 'CREATE' ? 'active' : ''}`}
                onClick={() => setSidebarTab('CREATE')}
              >
                Yeni Lisans Üret
              </button>
              <button
                type="button"
                className={`sidebar-tab-btn ${sidebarTab === 'PLAN' ? 'active' : ''}`}
                onClick={() => setSidebarTab('PLAN')}
              >
                Plan Düzenle
              </button>
            </div>

            {/* TAB 1: Yeni Lisans & Firma Ekle */}
            {sidebarTab === 'CREATE' && (
              <form className="form-grid compact" onSubmit={handleCreateTenant}>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>Firma & Lisans Kaydı</h4>
                <p className="muted" style={{ fontSize: '0.8rem' }}>Aşağıdaki formu doldurarak yeni bir firma oluşturabilir ve otomatik lisans kodu üretebilirsiniz.</p>

                <label>
                  Firma Adı *
                  <input
                    required
                    placeholder="Örn: Antigravity A.Ş."
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                  />
                </label>
                <label>
                  Vergi Numarası
                  <input
                    placeholder="10 haneli vergi no"
                    value={newCompanyTaxNumber}
                    onChange={(e) => setNewCompanyTaxNumber(e.target.value)}
                  />
                </label>
                <label>
                  E-posta
                  <input
                    type="email"
                    placeholder="info@firma.com"
                    value={newCompanyEmail}
                    onChange={(e) => setNewCompanyEmail(e.target.value)}
                  />
                </label>
                <label>
                  Telefon
                  <input
                    placeholder="+90 555 123 4567"
                    value={newCompanyPhone}
                    onChange={(e) => setNewCompanyPhone(e.target.value)}
                  />
                </label>
                <label>
                  Adres
                  <input
                    placeholder="Firma açık adresi"
                    value={newCompanyAddress}
                    onChange={(e) => setNewCompanyAddress(e.target.value)}
                  />
                </label>

                <button className="btn primary" type="submit" disabled={createCompany.isPending || generateLicense.isPending}>
                  {createCompany.isPending || generateLicense.isPending ? 'Oluşturuluyor...' : 'Lisans ve Firma Oluştur'}
                </button>
              </form>
            )}

            {/* TAB 2: Seçili Firma Planı */}
            {sidebarTab === 'PLAN' && (
              <>
                {selectedRow ? (
                  <form className="form-grid compact" onSubmit={onSavePlan}>
                    <h4 style={{ margin: 0, fontSize: '1rem' }}>Plan & Paket Düzenleme</h4>
                    <p className="muted" style={{ fontSize: '0.8rem' }}>
                      {selectedRow.company.name} | Runtime: {selectedRow.access.status}
                    </p>

                    <div style={{ marginBottom: '8px' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ width: '100%' }}
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
                        Grace günü
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
                        Paket başlangıcı
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
                        Paket bitişi
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
                      Manuel düzenleme notu *
                      <input
                        placeholder="Örn: Ödeme yapıldı, süre uzatıldı."
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
                      Manuel Planı Kaydet
                    </button>
                  </form>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <p className="muted">Düzenleme yapmak için sol listeden bir firma seçin.</p>
                  </div>
                )}
              </>
            )}
          </article>

          {/* Yaklaşan Yenileme Listesi */}
          <article className="card">
            <h3>Yaklaşan Yenileme Listesi ({upcomingPagination.total})</h3>
            <p className="muted" style={{ fontSize: '0.8rem' }}>Son {dueLimit} gün içinde vadesi dolacak firmalar.</p>
            <div className="table-wrap" style={{ marginTop: '12px' }}>
              <table style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Firma</th>
                    <th>Durum</th>
                    <th>Gün</th>
                    <th>Bitiş</th>
                  </tr>
                </thead>
                <tbody>
                  <TableState
                    colSpan={4}
                    emptyText="Yaklaşan yenileme kaydı bulunmuyor."
                    errorText={subscriptionErrorText}
                    loading={subscriptionLoading}
                    rowCount={upcomingPagination.total}
                  />
                  {upcomingPagination.visibleRows.map((row) => (
                    <tr key={`due:${row.company.id}`}>
                      <td style={{ fontWeight: 600 }}>{row.company.name}</td>
                      <td>{row.access.status}</td>
                      <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{row.access.daysRemaining ?? '-'}</td>
                      <td>{toDateTime(row.company.packageExpiresAt)}</td>
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
        </div>
      </div>

      {/* Modern License key activation success modal */}
      {generatedLicenseInfo && (
        <div className="modal-overlay">
          <div className="modal-content glassmorphic animate-fade-in">
            <div className="modal-header">
              <h3>🎉 Yeni Lisans Başarıyla Üretildi!</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setGeneratedLicenseInfo(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-desc">
                <strong>{generatedLicenseInfo.companyName}</strong> firması için lisans başarıyla oluşturulmuştur. Bu lisans kodunu uygulamayı aktive etmek için kullanabilirsiniz.
              </p>
              <div className="generated-key-container">
                <span className="key-label">LİSANS ANAHTARI</span>
                <div className="generated-key-box">
                  <code>{generatedLicenseInfo.licenseKey}</code>
                  <button
                    type="button"
                    className={`btn primary copy-large-btn ${copiedKey === generatedLicenseInfo.licenseKey ? 'success' : ''}`}
                    onClick={() => handleCopy(generatedLicenseInfo.licenseKey)}
                  >
                    {copiedKey === generatedLicenseInfo.licenseKey ? '✓ Kopyalandı!' : 'Lisansı Kopyala'}
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => setGeneratedLicenseInfo(null)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}






