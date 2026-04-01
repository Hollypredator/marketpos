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
  organization: 'Firma/Sube',
  catalog: 'Urun/Kategori',
  stock: 'Stok',
  users: 'Kullanicilar',
  reports: 'Raporlar',
  subscription: 'Paket Takip',
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
      <header className="admin-header card">
        <div>
          <h1>MarketPOS Dashboard</h1>
          <p className="muted">
            {userFullName} | Rol: {userRole}
          </p>
        </div>
        <button className="btn ghost" type="button" onClick={onLogout}>
          Cikis Yap
        </button>
      </header>

      {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}

      <section className="card toolbar">
        <div className="scope-row">
          {canSelectCompany && (
            <label>
              Firma
              <select value={companyId} onChange={(event) => onCompanyChange(event.target.value)}>
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
          <button className="btn" type="button" onClick={onRefresh} disabled={refreshDisabled}>
            {refreshLabel}
          </button>
        </div>
        <div className="tab-row">
          {allowedTabs.map((tab) => (
            <button
              key={tab}
              className={`btn tab ${activeTab === tab ? 'active' : ''}`}
              type="button"
              onClick={() => onTabChange(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </section>

      {children}
    </main>
  );
}

