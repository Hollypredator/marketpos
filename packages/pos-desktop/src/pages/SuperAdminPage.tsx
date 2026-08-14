import React, { useEffect, useState } from 'react';

interface OverviewStats {
  branches: number;
  companies: { active: number; expired: number; suspended: number; total: number };
  registers: number;
  sales: { totalCount: number; totalVolume: number };
  templates: Array<{ code: string; displayName: string }>;
  users: number;
}

interface TenantRow {
  address: string | null;
  branchCount: number;
  branches: Array<{ id: string; name: string; registers: Array<{ id: string; name: string }> }>;
  createdAt: string;
  daysRemaining: number | null;
  email: string | null;
  id: string;
  licenseKey: string | null;
  name: string;
  packageExpiresAt: string | null;
  phone: string | null;
  productCount: number;
  runtimeStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED';
  salesCount: number;
  taxNumber: string | null;
  userCount: number;
}

interface AuditLogRow {
  actorName: string;
  companyName: string;
  createdAt: string;
  eventType: string;
  id: string;
  nextStatus: string;
  note: string | null;
  previousStatus: string | null;
}

interface BackupRow {
  companyCount: number;
  createdAt: string;
  filename: string;
  id: string;
  note: string | null;
  productCount: number;
  saleCount: number;
  sizeBytes: number;
}

interface TelemetryRegister {
  appVersion: string;
  branchName: string;
  companyId: string;
  companyName: string;
  isOnline: boolean;
  lastPingAt: string | null;
  pendingQueueSize: number;
  registerId: string;
  registerName: string;
  statusBadge: 'OFFLINE' | 'ONLINE' | 'QUEUE_LAG';
}

interface ResellerRow {
  activeTenantCount: number;
  createdAt: string;
  email: string;
  id: string;
  name: string;
  phone: string;
  quota: number;
  region: string;
}

export const SuperAdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'audit' | 'backups' | 'overview' | 'releases' | 'resellers' | 'telemetry' | 'tenants'>('tenants');
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [telemetryRegisters, setTelemetryRegisters] = useState<TelemetryRegister[]>([]);
  const [telemetryOverview, setTelemetryOverview] = useState<{ offlineCount: number; onlineCount: number; queueLagCount: number; totalRegisters: number } | null>(null);
  const [resellers, setResellers] = useState<ResellerRow[]>([]);
  const [latestRelease, setLatestRelease] = useState<{ downloadUrl?: string; isMandatory?: boolean; releaseNotes?: string; version?: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  // Onboarding Modal State
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('123456');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password Reset Modal State
  const [selectedTenantForReset, setSelectedTenantForReset] = useState<TenantRow | null>(null);
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // Release Modal State
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('1.1.0');
  const [releaseNotes, setReleaseNotes] = useState('Performans iyileştirmeleri ve yeni fiş tasarımı.');
  const [releaseUrl, setReleaseUrl] = useState('/downloads/marketpos-v1.1.0.exe');
  const [isMandatoryRelease, setIsMandatoryRelease] = useState(false);

  // Reseller Modal State
  const [isResellerModalOpen, setIsResellerModalOpen] = useState(false);
  const [resellerName, setResellerName] = useState('');
  const [resellerEmail, setResellerEmail] = useState('');
  const [resellerPhone, setResellerPhone] = useState('');
  const [resellerRegion, setResellerRegion] = useState('');
  const [resellerQuota, setResellerQuota] = useState(25);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/superadmin/overview');
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch (err) {
      console.error('Failed to fetch overview stats:', err);
    }
  };

  const fetchTenants = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter) params.set('status', statusFilter);
      
      const res = await fetch(`/api/superadmin/tenants?${params.toString()}`);
      const json = await res.json();
      if (json.success) setTenants(json.data);
    } catch (err) {
      console.error('Failed to fetch tenants:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/superadmin/backups');
      const json = await res.json();
      if (json.success) setBackups(json.data);
    } catch (err) {
      console.error('Failed to fetch backups:', err);
    }
  };

  const fetchTelemetry = async () => {
    try {
      const res = await fetch('/api/superadmin/telemetry/map');
      const json = await res.json();
      if (json.success) {
        setTelemetryRegisters(json.data.registers);
        setTelemetryOverview(json.data.overview);
      }
    } catch (err) {
      console.error('Failed to fetch telemetry:', err);
    }
  };

  const fetchReleases = async () => {
    try {
      const res = await fetch('/api/superadmin/releases/check');
      const json = await res.json();
      if (json.success && json.data.latestRelease) {
        setLatestRelease(json.data.latestRelease);
      }
    } catch (err) {
      console.error('Failed to fetch releases:', err);
    }
  };

  const fetchResellers = async () => {
    try {
      const res = await fetch('/api/superadmin/resellers');
      const json = await res.json();
      if (json.success) setResellers(json.data);
    } catch (err) {
      console.error('Failed to fetch resellers:', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/superadmin/audit-logs');
      const json = await res.json();
      if (json.success) setAuditLogs(json.data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  useEffect(() => {
    fetchOverview();
    fetchTenants();
    fetchBackups();
    fetchTelemetry();
    fetchReleases();
    fetchResellers();
    fetchAuditLogs();
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [searchQuery, statusFilter]);

  const handleCreateBackup = async () => {
    setStatusMessage(null);
    try {
      const res = await fetch('/api/superadmin/backups/create', {
        body: JSON.stringify({ note: 'Manuel Sistem Snapshot Yedeği' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ text: `✅ Tam sistem veritabanı yedeği oluşturuldu! (${json.data.filename})`, type: 'success' });
        fetchBackups();
      } else {
        setStatusMessage({ text: json.error || 'Yedekleme hatası', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Yedekleme hatası', type: 'error' });
    }
  };

  const handleOnboardTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !adminFullName.trim() || !adminUsername.trim() || !adminPassword.trim()) {
      setStatusMessage({ text: 'Lütfen gerekli alanları doldurunuz.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/superadmin/tenants/onboard', {
        body: JSON.stringify({
          adminFullName: adminFullName.trim(),
          adminPassword: adminPassword.trim(),
          adminUsername: adminUsername.trim(),
          companyName: companyName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          taxNumber: taxNumber.trim() || undefined,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const json = await res.json();

      if (json.success) {
        setStatusMessage({ text: `✅ "${companyName}" başarıyla kuruldu! (Yönetici: ${adminUsername})`, type: 'success' });
        setIsOnboardModalOpen(false);
        setCompanyName('');
        setTaxNumber('');
        setPhone('');
        setEmail('');
        setAdminFullName('');
        fetchOverview();
        fetchTenants();
      } else {
        setStatusMessage({ text: json.error || 'Kurulum hatası', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Kurulum hatası', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTenantStatus = async (tenant: TenantRow) => {
    const nextStatus = tenant.runtimeStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const confirmText = nextStatus === 'SUSPENDED'
      ? `"${tenant.name}" marketinin erişimini dondurmak istediğinize emin misiniz?`
      : `"${tenant.name}" marketinin erişimini tekrar aktifleştirmek istiyor musunuz?`;

    if (!window.confirm(confirmText)) return;

    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant.id}/status`, {
        body: JSON.stringify({ status: nextStatus }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ text: `Durum güncellendi: ${nextStatus}`, type: 'success' });
        fetchTenants();
        fetchOverview();
      } else {
        setStatusMessage({ text: json.error || 'Güncelleme hatası', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Hata oluştu', type: 'error' });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantForReset || !newAdminPassword.trim()) return;

    try {
      const res = await fetch(`/api/superadmin/tenants/${selectedTenantForReset.id}/reset-password`, {
        body: JSON.stringify({ newPassword: newAdminPassword.trim() }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ text: `✅ "${selectedTenantForReset.name}" yönetici şifresi güncellendi.`, type: 'success' });
        setSelectedTenantForReset(null);
        setNewAdminPassword('');
      } else {
        setStatusMessage({ text: json.error || 'Şifre sıfırlama hatası', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Hata oluştu', type: 'error' });
    }
  };

  const handlePublishRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseVersion.trim() || !releaseNotes.trim()) return;

    try {
      const res = await fetch('/api/superadmin/releases/publish', {
        body: JSON.stringify({
          downloadUrl: releaseUrl.trim(),
          isMandatory: isMandatoryRelease,
          releaseNotes: releaseNotes.trim(),
          version: releaseVersion.trim(),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ text: `🚀 Yeni Sürüm (v${releaseVersion}) başarıyla yayınlandı!`, type: 'success' });
        setIsReleaseModalOpen(false);
        fetchReleases();
      } else {
        setStatusMessage({ text: json.error || 'Sürüm yayınlama hatası', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Hata oluştu', type: 'error' });
    }
  };

  const handleCreateReseller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resellerName.trim() || !resellerEmail.trim() || !resellerPhone.trim() || !resellerRegion.trim()) return;

    try {
      const res = await fetch('/api/superadmin/resellers/create', {
        body: JSON.stringify({
          email: resellerEmail.trim(),
          name: resellerName.trim(),
          phone: resellerPhone.trim(),
          quota: resellerQuota,
          region: resellerRegion.trim(),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ text: `💼 Yeni Bayi (${resellerName}) tanımlandı!`, type: 'success' });
        setIsResellerModalOpen(false);
        setResellerName('');
        setResellerEmail('');
        setResellerPhone('');
        setResellerRegion('');
        fetchResellers();
      } else {
        setStatusMessage({ text: json.error || 'Bayi ekleme hatası', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Hata oluştu', type: 'error' });
    }
  };

  return (
    <div className="page-shell" style={{ padding: '24px', overflowY: 'auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            👑 Merkezi SüperAdmin Platform Paneli
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Tüm market müşterilerinizi, veritabanı yedeklerinizi, canlı kasalarınızı ve sürümlerinizi merkezden yönetin.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-ghost"
            onClick={handleCreateBackup}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, border: '1px solid var(--border)' }}
          >
            <span>🗄️</span> DB Yedeği Al
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => setIsOnboardModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}
          >
            <span>⚡</span> Yeni Market Ekle (1-Tıkla Kurulum)
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`status-banner ${statusMessage.type}`}
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            borderRadius: '10px',
            fontWeight: 600,
            background: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${statusMessage.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* KPI Cards Overview */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
          <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Toplam Market</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent)' }}>{stats.companies.total}</div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Kayıtlı Müşteri Tenant</span>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--success)' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Aktif Marketler</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: 'var(--success)' }}>{stats.companies.active}</div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Erişimi Açık Müşteriler</span>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dondurulmuş</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: 'var(--danger)' }}>{stats.companies.suspended}</div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Erişimi Kapatılanlar</span>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--warning)' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Canlı Kasalar</span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '4px', color: 'var(--warning)' }}>
              {telemetryOverview ? `${telemetryOverview.onlineCount} / ${stats.registers}` : stats.registers}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Çevrimiçi Kasa Sayısı</span>
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--border)', marginBottom: '20px', overflowX: 'auto' }}>
        <button
          className={`btn btn-ghost ${activeTab === 'tenants' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('tenants')}
          style={{ borderRadius: '8px 8px 0 0', fontWeight: 700 }}
        >
          🏪 Market Müşterileri ({tenants.length})
        </button>
        <button
          className={`btn btn-ghost ${activeTab === 'backups' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('backups')}
          style={{ borderRadius: '8px 8px 0 0', fontWeight: 700 }}
        >
          🗄️ Veritabanı Yedekleri ({backups.length})
        </button>
        <button
          className={`btn btn-ghost ${activeTab === 'telemetry' ? 'btn-primary' : ''}`}
          onClick={() => { setActiveTab('telemetry'); fetchTelemetry(); }}
          style={{ borderRadius: '8px 8px 0 0', fontWeight: 700 }}
        >
          📡 Canlı Kasa Haritası
        </button>
        <button
          className={`btn btn-ghost ${activeTab === 'releases' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('releases')}
          style={{ borderRadius: '8px 8px 0 0', fontWeight: 700 }}
        >
          🚀 Sürüm Güncellemeleri
        </button>
        <button
          className={`btn btn-ghost ${activeTab === 'resellers' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('resellers')}
          style={{ borderRadius: '8px 8px 0 0', fontWeight: 700 }}
        >
          💼 Bayiler ({resellers.length})
        </button>
        <button
          className={`btn btn-ghost ${activeTab === 'audit' ? 'btn-primary' : ''}`}
          onClick={() => setActiveTab('audit')}
          style={{ borderRadius: '8px 8px 0 0', fontWeight: 700 }}
        >
          📜 Denetim Logları
        </button>
      </div>

      {/* TAB 1: Tenants List */}
      {activeTab === 'tenants' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
            <input
              type="text"
              className="input"
              placeholder="Market adı, Vergi No veya E-posta ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ maxWidth: '360px' }}
            />

            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ maxWidth: '200px' }}
            >
              <option value="">Tüm Durumlar</option>
              <option value="ACTIVE">Aktif Marketler</option>
              <option value="SUSPENDED">Dondurulmuş Marketler</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px' }}>Market / Müşteri Adı</th>
                  <th style={{ padding: '10px' }}>Vergi / İletişim</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Şube / Kasa</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Stok / Ürün</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Durum</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Yükleniyor...</td>
                  </tr>
                ) : (
                  tenants.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 10px' }}>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{t.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Kayıt: {new Date(t.createdAt).toLocaleDateString('tr-TR')}</div>
                      </td>
                      <td style={{ padding: '12px 10px', fontSize: '0.85rem' }}>
                        <div>{t.taxNumber ? `VN: ${t.taxNumber}` : 'Vergi No Yok'}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{t.phone || t.email || '-'}</div>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {t.branchCount} Şube / {t.branches.reduce((acc: number, b: { registers: Array<{ id: string; name: string }> }) => acc + b.registers.length, 0)} Kasa
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {t.productCount} Çeşit Ürün
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            background: t.runtimeStatus === 'ACTIVE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: t.runtimeStatus === 'ACTIVE' ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {t.runtimeStatus === 'ACTIVE' ? 'AKTİF' : 'DONDURULDU'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            className={`btn btn-sm ${t.runtimeStatus === 'SUSPENDED' ? 'btn-success' : 'btn-danger'}`}
                            onClick={() => handleToggleTenantStatus(t)}
                          >
                            {t.runtimeStatus === 'SUSPENDED' ? 'Erişimi Aç' : 'Dondur'}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setSelectedTenantForReset(t)}
                            title="Yönetici Şifresini Sıfırla"
                          >
                            🔑 Şifre
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Database Backups */}
      {activeTab === 'backups' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0 }}>🗄️ Veritabanı Snapshot Yedekleri</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Tüm marketlerin şifrelenmiş veritabanı snapshot yedeklerini indirin veya manuel yeni yedek oluşturun.
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleCreateBackup}>
              + Şimdi Manuel Yedek Al
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px' }}>Yedek Dosyası</th>
                <th style={{ padding: '10px' }}>Oluşturulma Tarihi</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Market / Ürün / Satış</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Boyut</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 10px', fontWeight: 700 }}>{b.filename}</td>
                  <td style={{ padding: '12px 10px' }}>{new Date(b.createdAt).toLocaleString('tr-TR')}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                    {b.companyCount} Market | {b.productCount} Ürün | {b.saleCount} Satış
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700 }}>
                    {(b.sizeBytes / 1024).toFixed(1)} KB
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`/backups/${b.filename}`}
                      download={b.filename}
                      style={{ textDecoration: 'none' }}
                    >
                      💾 İndir
                    </a>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Henüz veritabanı yedeği alınmadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: Telemetry Map */}
      {activeTab === 'telemetry' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0 }}>📡 Canlı Kasa & Telemetri Haritası</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Tüm kasaların anlık canlı/çevrimdışı durumlarını ve senkronizasyon kuyruk seviyelerini takip edin.
              </p>
            </div>
            <button className="btn btn-ghost" onClick={fetchTelemetry}>🔄 Yenile</button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px' }}>Market / Şube</th>
                <th style={{ padding: '10px' }}>Kasa Adı</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Canlı Durum</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Versiyon</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Bekleyen Kuyruk</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Son Ping</th>
              </tr>
            </thead>
            <tbody>
              {telemetryRegisters.map((reg) => (
                <tr key={reg.registerId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 10px' }}>
                    <div style={{ fontWeight: 800 }}>{reg.companyName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{reg.branchName}</div>
                  </td>
                  <td style={{ padding: '12px 10px', fontWeight: 700 }}>{reg.registerName}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        background: reg.statusBadge === 'ONLINE' ? 'rgba(16, 185, 129, 0.15)' : reg.statusBadge === 'QUEUE_LAG' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: reg.statusBadge === 'ONLINE' ? 'var(--success)' : reg.statusBadge === 'QUEUE_LAG' ? 'var(--warning)' : 'var(--danger)',
                      }}
                    >
                      {reg.statusBadge === 'ONLINE' ? '🟢 ÇEVRİMİÇİ' : reg.statusBadge === 'QUEUE_LAG' ? '⚠️ KUYRUK GECİKMESİ' : '🔴 ÇEVRİMDİŞİ'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700 }}>{reg.appVersion}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800 }}>
                    {reg.pendingQueueSize > 0 ? `${reg.pendingQueueSize} Satış` : '0 (Temiz)'}
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {reg.lastPingAt ? new Date(reg.lastPingAt).toLocaleTimeString('tr-TR') : 'Hiç Ping Atmadı'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: Auto-Updater Releases */}
      {activeTab === 'releases' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0 }}>🚀 Masaüstü & Web Güncelleme Dağıtım Kanalı</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Tüm kasalara canlı versiyon güncellemesi ve yeni .exe paketi yayınlayın.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setIsReleaseModalOpen(true)}>
              + Yeni Sürüm Yayınla
            </button>
          </div>

          {latestRelease && (
            <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', borderLeft: '4px solid var(--accent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem' }}>🎉 Yayındaki Aktif Sürüm: v{latestRelease.version}</h4>
                {latestRelease.isMandatory && (
                  <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800 }}>ZORUNLU GÜNCELLEME</span>
                )}
              </div>
              <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>{latestRelease.releaseNotes}</p>
              <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                İndirme Bağlantısı: <code>{latestRelease.downloadUrl}</code>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Resellers */}
      {activeTab === 'resellers' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0 }}>💼 Bayi & Saha Satış Temsilcileri</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Bölge bayilerinize lisans kotaları tanımlayın ve yeni müşteri kurulumlarını takip edin.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setIsResellerModalOpen(true)}>
              + Yeni Bayi Ekle
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px' }}>Bayi Adı</th>
                <th style={{ padding: '10px' }}>Bölge</th>
                <th style={{ padding: '10px' }}>İletişim</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Aktif Marketler</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Lisans Kotası</th>
              </tr>
            </thead>
            <tbody>
              {resellers.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 10px', fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: '12px 10px' }}>{r.region}</td>
                  <td style={{ padding: '12px 10px', fontSize: '0.85rem' }}>{r.phone} | {r.email}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800, color: 'var(--success)' }}>
                    {r.activeTenantCount} Market
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800 }}>
                    {r.quota} Lisans
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 6: Audit Logs */}
      {activeTab === 'audit' && (
        <div className="card">
          <h3>📜 Sistem Denetim & Lisans Hareket Logları</h3>
          <div style={{ marginTop: '12px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px' }}>Tarih</th>
                  <th style={{ padding: '8px' }}>Market</th>
                  <th style={{ padding: '8px' }}>İşlem</th>
                  <th style={{ padding: '8px' }}>Aktör</th>
                  <th style={{ padding: '8px' }}>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>{new Date(log.createdAt).toLocaleString('tr-TR')}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{log.companyName}</td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{log.eventType}</td>
                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{log.actorName}</td>
                    <td style={{ padding: '8px' }}>{log.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 1-Click Onboard Tenant Modal */}
      {isOnboardModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsOnboardModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '640px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">⚡ 1-Tıkla Yeni Market Kur</h2>
                <p className="modal-subtitle">Market müşteri bilgilerini girin, 1 saniyede tüm kataloğu kurun.</p>
              </div>
              <button className="modal-close" onClick={() => setIsOnboardModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleOnboardTenant} className="modal-body" style={{ display: 'grid', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Market / Firma Adı *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Örn: Yılmaz Gıda Market"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Katalog Şablonu</label>
                  <div className="input" style={{ background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
                    🛒 Evrensel Market Kataloğu (4000+ Ürün)
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Vergi Numarası</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="10 haneli vergi no"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Telefon</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="0555 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '10px', display: 'grid', gap: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>🔑 Market Yönetici Giriş Bilgileri</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Yetkili Adı Soyadı *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ahmet Yılmaz"
                      value={adminFullName}
                      onChange={(e) => setAdminFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Kullanıcı Adı *</label>
                    <input
                      type="text"
                      className="input"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Şifre *</label>
                    <input
                      type="text"
                      className="input"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsOnboardModalOpen(false)}>İptal</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Kuruluyor...' : '🚀 Market Kur (1-Tıkla Seed Et)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {selectedTenantForReset && (
        <div className="modal-backdrop" onClick={() => setSelectedTenantForReset(null)}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">🔑 Şifre Sıfırla</h2>
              <button className="modal-close" onClick={() => setSelectedTenantForReset(null)}>✕</button>
            </div>
            <form onSubmit={handleResetPassword} className="modal-body" style={{ display: 'grid', gap: '12px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <strong>{selectedTenantForReset.name}</strong> marketinin yönetici şifresini güncelleyin.
              </p>
              <div className="form-group">
                <label className="form-label">Yeni Şifre</label>
                <input
                  type="text"
                  className="input"
                  placeholder="En az 6 karakter"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTenantForReset(null)}>İptal</button>
                <button type="submit" className="btn btn-primary">Şifreyi Güncelle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Publish Release Modal */}
      {isReleaseModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsReleaseModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">🚀 Yeni Sürüm Yayınla</h2>
              <button className="modal-close" onClick={() => setIsReleaseModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handlePublishRelease} className="modal-body" style={{ display: 'grid', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Versiyon Numarası *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Örn: 1.1.0"
                  value={releaseVersion}
                  onChange={(e) => setReleaseVersion(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Sürüm Notları *</label>
                <textarea
                  className="input"
                  rows={3}
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">İndirme Bağlantısı (.exe URL)</label>
                <input
                  type="text"
                  className="input"
                  value={releaseUrl}
                  onChange={(e) => setReleaseUrl(e.target.value)}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={isMandatoryRelease}
                  onChange={(e) => setIsMandatoryRelease(e.target.checked)}
                />
                Zorunlu Güncelleme (Kasaların güncellemeyi hemen yüklemesini zorunlu tut)
              </label>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsReleaseModalOpen(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">🚀 Sürümü Canlıya Al</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Reseller Modal */}
      {isResellerModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsResellerModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">💼 Yeni Bayi Ekle</h2>
              <button className="modal-close" onClick={() => setIsResellerModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateReseller} className="modal-body" style={{ display: 'grid', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Bayi / Temsilci Adı *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Örn: İç Anadolu Bilişim Ltd."
                  value={resellerName}
                  onChange={(e) => setResellerName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Hizmet Bölgesi *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Örn: Ankara & İç Anadolu"
                  value={resellerRegion}
                  onChange={(e) => setResellerRegion(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">E-posta *</label>
                  <input
                    type="email"
                    className="input"
                    value={resellerEmail}
                    onChange={(e) => setResellerEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Telefon *</label>
                  <input
                    type="text"
                    className="input"
                    value={resellerPhone}
                    onChange={(e) => setResellerPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Lisans Kotası</label>
                <input
                  type="number"
                  className="input"
                  value={resellerQuota}
                  onChange={(e) => setResellerQuota(Number(e.target.value))}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsResellerModalOpen(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">Bayiyi Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
