import React from 'react';

import type { DashboardTab } from '../lib/route-access';

interface ScopeCompany {
  id: string;
  name: string;
}

interface ScopeBranch {
  id: string;
  name: string;
}

interface AppShellProps {
  activeTab: DashboardTab;
  allowedTabs: DashboardTab[];
  banner: { text: string; type: 'error' | 'success' } | null;
  branchId: string;
  branches: ScopeBranch[];
  canSelectCompany: boolean;
  children: React.ReactNode;
  companies: ScopeCompany[];
  companyId: string;
  onBranchChange: (branchId: string) => void;
  onCompanyChange: (companyId: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  onTabChange: (nextTab: DashboardTab) => void;
  refreshDisabled: boolean;
  refreshLabel: string;
  userFullName: string;
  userRole: string;
}

const TAB_LABELS: Record<DashboardTab, string> = {
  setup: 'Firma Kurulum',
  organization: 'Firma/Sube',
  catalog: 'Urun/Kategori',
  stock: 'Stok',
  users: 'Kullanicilar',
  reports: 'Raporlar',
  suppliers: 'Cari & Tedarik',
  subscription: 'Paket Takip',
};

const TAB_HINTS: Record<DashboardTab, string> = {
  setup: 'Yeni firma acilisi ve provisioning adimlari',
  organization: 'Firma ve sube yapisini yonetin',
  catalog: 'Urun, kategori ve temel tanimlar',
  stock: 'Stok seviyeleri ve hareket kayitlari',
  users: 'Kullanici rolleri ve erisim yetkileri',
  reports: 'Satis ve operasyon raporlari',
  suppliers: 'Tedarikci, Cari ve Fatura yonetimi',
  subscription: 'Abonelik ve lisans operasyonlari',
};

export function AppShell({
  activeTab,
  allowedTabs,
  banner,
  branchId,
  branches,
  canSelectCompany,
  children,
  companies,
  companyId,
  onBranchChange,
  onCompanyChange,
  onLogout,
  onRefresh,
  onTabChange,
  refreshDisabled,
  refreshLabel,
  userFullName,
  userRole,
}: AppShellProps): React.ReactElement {
  return (
    <main className="admin-shell">
      <aside className="admin-sidebar card">
        <div className="sidebar-brand">
          <p className="sidebar-eyebrow">MarketPOS Backoffice</p>
          <strong>{userFullName}</strong>
          <p className="muted">Rol: {userRole}</p>
        </div>
        <nav className="sidebar-nav" aria-label="Dashboard Sekmeleri">
          {allowedTabs.map((tab) => (
            <button
              key={tab}
              className={`nav-item ${activeTab === tab ? 'active' : ''}`}
              type="button"
              onClick={() => onTabChange(tab)}
            >
              <span>{TAB_LABELS[tab]}</span>
              <small>{TAB_HINTS[tab]}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="btn ghost" type="button" onClick={onLogout}>
            Cikis Yap
          </button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-header card">
          <div>
            <h1>{TAB_LABELS[activeTab]}</h1>
            <p className="muted">{TAB_HINTS[activeTab]}</p>
          </div>
          <button className="btn" type="button" onClick={onRefresh} disabled={refreshDisabled}>
            {refreshLabel}
          </button>
        </header>

        {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}

        <section className="card toolbar">
          <div className="scope-row">
            {canSelectCompany && (
              <label>
                Firma
                <select value={companyId} onChange={(event) => onCompanyChange(event.target.value)}>
                  <option value="">Firma secin</option>
                  {companies.length === 0 && <option value="">Firma yok</option>}
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Sube
              <select value={branchId} onChange={(event) => onBranchChange(event.target.value)}>
                {branches.length === 0 && <option value="">Sube yok</option>}
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {children}
      </section>
    </main>
  );
}
