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
  setup:        'Firma Kurulum',
  organization: 'Firma / Şube',
  catalog:      'Ürün / Kategori',
  stock:        'Stok',
  users:        'Kullanıcılar',
  reports:      'Raporlar',
  suppliers:    'Cari & Tedarik',
  subscription: 'Paket Takip',
};

const TAB_HINTS: Record<DashboardTab, string> = {
  setup:        'Yeni firma açılışı ve provisioning adımları',
  organization: 'Firma ve şube yapısını yönetin',
  catalog:      'Ürün, kategori ve temel tanımlar',
  stock:        'Stok seviyeleri ve hareket kayıtları',
  users:        'Kullanıcı rolleri ve erişim yetkileri',
  reports:      'Satış ve operasyon raporları',
  suppliers:    'Tedarikçi, Cari ve Fatura yönetimi',
  subscription: 'Abonelik ve lisans operasyonları',
};

// SVG icons for each tab
const TAB_ICONS: Record<DashboardTab, React.ReactElement> = {
  setup: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="2"/>
      <path d="M5 8h6M5 5h6M5 11h4" strokeLinecap="round"/>
    </svg>
  ),
  organization: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 13V6l6-4 6 4v7" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="5.5" y="9" width="5" height="4" rx="1"/>
    </svg>
  ),
  subscription: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3.5 8l2.5 2.5 6.5-6.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="8" cy="8" r="6"/>
    </svg>
  ),
  users: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="5" r="2.5"/>
      <path d="M1 13c0-2.5 2-4 5-4s5 1.5 5 4" strokeLinecap="round"/>
      <path d="M12 7c1.5 0 3 1 3 3" strokeLinecap="round"/>
      <circle cx="13" cy="4" r="1.5"/>
    </svg>
  ),
  catalog: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 3h12v2H2zM2 7h12v2H2zM2 11h8v2H2z" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  stock: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="9" width="4" height="5" rx="1"/>
      <rect x="6" y="6" width="4" height="8" rx="1"/>
      <rect x="10" y="3" width="4" height="11" rx="1"/>
    </svg>
  ),
  suppliers: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6"/>
      <path d="M8 4v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  reports: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 13V8M7 13V5M11 13V9M15 13V3" strokeLinecap="round"/>
    </svg>
  ),
};

// Section groupings
const PLATFORM_TABS: DashboardTab[] = ['setup', 'organization', 'subscription', 'users'];
const STORE_TABS: DashboardTab[]    = ['catalog', 'stock', 'suppliers'];
const ANALYTICS_TABS: DashboardTab[] = ['reports'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

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
  const hasPlatform  = PLATFORM_TABS.some((t)  => allowedTabs.includes(t));
  const hasStore     = STORE_TABS.some((t)     => allowedTabs.includes(t));
  const hasAnalytics = ANALYTICS_TABS.some((t) => allowedTabs.includes(t));

  const renderNavItem = (tab: DashboardTab) => {
    if (!allowedTabs.includes(tab)) return null;
    return (
      <button
        key={tab}
        type="button"
        className={`nav-item ${activeTab === tab ? 'active' : ''}`}
        onClick={() => onTabChange(tab)}
        title={TAB_HINTS[tab]}
      >
        {TAB_ICONS[tab]}
        <span className="nav-item-label">{TAB_LABELS[tab]}</span>
      </button>
    );
  };

  return (
    <main className="admin-shell">
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-logo-row">
            <div className="sidebar-logo-icon">M</div>
            <span className="sidebar-app-name">MarketPOS</span>
          </div>
          <p className="sidebar-eyebrow">Backoffice Panel</p>
          <p className="sidebar-user-name">{userFullName}</p>
          <p className="sidebar-role">{userRole}</p>
        </div>

        {/* Nav */}
        {hasPlatform && (
          <div className="nav-section">
            <span className="nav-section-label">Platform</span>
            {PLATFORM_TABS.map(renderNavItem)}
          </div>
        )}

        {hasStore && (
          <div className="nav-section">
            <span className="nav-section-label">Mağaza</span>
            {STORE_TABS.map(renderNavItem)}
          </div>
        )}

        {hasAnalytics && (
          <div className="nav-section">
            <span className="nav-section-label">Analiz</span>
            {ANALYTICS_TABS.map(renderNavItem)}
          </div>
        )}

        {/* Footer */}
        <div className="sidebar-footer">
          <button type="button" className="user-row" onClick={onLogout}>
            <div className="user-avatar">{getInitials(userFullName)}</div>
            <div className="user-info">
              <span className="user-name">{userFullName}</span>
              <span className="user-email">Çıkış Yap</span>
            </div>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <section className="admin-main">
        {/* Top bar */}
        <header className="admin-header">
          <span className="admin-header-title">{TAB_LABELS[activeTab]}</span>
          <span className="admin-header-sub">{TAB_HINTS[activeTab]}</span>
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 'auto' }}
            onClick={onRefresh}
            disabled={refreshDisabled}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8a6 6 0 1 1 1.5 4" strokeLinecap="round"/>
              <path d="M2 12V8h4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {refreshLabel}
          </button>
        </header>

        {/* Scrollable page area */}
        <div className="admin-page-scroll">
          {/* Scope selectors */}
          <section className="toolbar">
            <div className="scope-row">
              {canSelectCompany && (
                <label>
                  Firma
                  <select value={companyId} onChange={(e) => onCompanyChange(e.target.value)}>
                    <option value="">Firma seçin</option>
                    {companies.length === 0 && <option value="">Firma yok</option>}
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Şube
                <select value={branchId} onChange={(e) => onBranchChange(e.target.value)}>
                  {branches.length === 0 && <option value="">Şube yok</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {banner && (
            <div className={`banner ${banner.type}`}>{banner.text}</div>
          )}

          {children}
        </div>
      </section>
    </main>
  );
}
