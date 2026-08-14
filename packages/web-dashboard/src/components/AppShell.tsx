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
  dashboard:    'Genel Bakış',
  setup:        'Firma Kurulum',
  organization: 'Firma / Şube',
  catalog:      'Ürün / Kategori',
  stock:        'Stok',
  transfers:    'Stok Transfer',
  users:        'Kullanıcılar',
  customers:    'Müşteriler',
  sales:        'Satış Geçmişi',
  reports:      'Raporlar',
  suppliers:    'Cari & Tedarik',
  subscription: 'Paket Takip',
  audit:        'Denetim Kaydı',
  yonetim:      'Fiyat Yönetimi',
};

const TAB_HINTS: Record<DashboardTab, string> = {
  dashboard:    'Günlük KPI özeti ve hızlı erişim',
  setup:        'Yeni firma açılışı ve provisioning adımları',
  organization: 'Firma ve şube yapısını yönetin',
  catalog:      'Ürün, kategori ve temel tanımlar',
  stock:        'Stok seviyeleri ve hareket kayıtları',
  transfers:    'Şubeler arası stok transfer yönetimi',
  users:        'Kullanıcı rolleri ve erişim yetkileri',
  customers:    'Müşteri kartları ve cari hesaplar',
  sales:        'Satış geçmişi ve fiş detayları',
  reports:      'Satış ve operasyon raporları',
  suppliers:    'Tedarikçi, Cari ve Fatura yönetimi',
  subscription: 'Abonelik ve lisans operasyonları',
  audit:        'Tüm firmaların denetim kayıtları',
  yonetim:      'Açılış sayfası fiyatlandırma paketlerini güncelleyin',
};

// SVG icons for each tab
const TAB_ICONS: Record<DashboardTab, React.ReactElement> = {
  dashboard: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="5" height="5" rx="1"/>
      <rect x="9" y="2" width="5" height="5" rx="1"/>
      <rect x="2" y="9" width="5" height="5" rx="1"/>
      <rect x="9" y="9" width="5" height="5" rx="1"/>
    </svg>
  ),
  setup: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="2"/>
      <path d="M5 8h6M5 5h6M5 11h4" strokeLinecap="round"/>
    </svg>
  ),
  audit: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4h10M3 8h7M3 12h5" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="2.5"/>
      <path d="M14 14l1.5 1.5" strokeLinecap="round"/>
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
  customers: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="5" r="3"/>
      <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" strokeLinecap="round"/>
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
  transfers: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h10M10 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 10H3M6 7l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  sales: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="2"/>
      <path d="M5 6h6M5 8.5h4M5 11h2" strokeLinecap="round"/>
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
  yonetim: (
    <svg className="nav-item-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1.5 5.5v5A1.5 1.5 0 0 0 3 12h10a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 13 4H3a1.5 1.5 0 0 0-1.5 1.5Z" />
      <circle cx="8" cy="8" r="2" />
      <path d="M5.5 12v1.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5V12" strokeLinecap="round" />
    </svg>
  ),
};

// Section groupings
const OVERVIEW_TABS: DashboardTab[]  = ['dashboard'];
const PLATFORM_TABS: DashboardTab[] = ['setup', 'organization', 'subscription', 'users', 'yonetim'];
const STORE_TABS: DashboardTab[]    = ['catalog', 'stock', 'transfers', 'customers', 'suppliers'];
const ANALYTICS_TABS: DashboardTab[] = ['sales', 'reports'];

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
  const hasOverview  = OVERVIEW_TABS.some((t)  => allowedTabs.includes(t));
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
        {hasOverview && (
          <div className="nav-section">
            {OVERVIEW_TABS.map(renderNavItem)}
          </div>
        )}

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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <a
              href="/api/license/download-desktop"
              target="_blank"
              rel="noreferrer"
              className="btn primary"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
              title="Windows Masaüstü Kasa Uygulamasını İndir (.exe)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Masaüstü Kasa İndir (.exe)</span>
            </a>
            <button
              type="button"
              className="btn"
              onClick={onRefresh}
              disabled={refreshDisabled}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 8a6 6 0 1 1 1.5 4" strokeLinecap="round"/>
                <path d="M2 12V8h4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {refreshLabel}
            </button>
          </div>
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
