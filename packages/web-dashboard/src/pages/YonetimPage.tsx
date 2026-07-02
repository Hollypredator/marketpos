import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { requestData, requestEnvelope } from '../lib/http/api-client';
import { ROLE_PERMISSIONS, ALL_PERMISSIONS } from '../lib/permissions';

interface YonetimPageProps {
  saving: boolean;
  onSetBanner: (banner: { text: string; type: 'error' | 'success' } | null) => void;
}

interface SystemStats {
  companies: { total: number; ACTIVE: number; GRACE: number; EXPIRED: number; SUSPENDED: number; UNCONFIGURED: number };
  users: { total: number };
  branches: { total: number };
}

export function YonetimPage({ saving, onSetBanner }: YonetimPageProps): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);

  const [form, setForm] = useState({
    monthlyPrice: 490,
    yearlyPrice: 390,
    ecoSetPrice: 24900,
    proSetPrice: 39900,
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      requestEnvelope<{
        monthlyPrice: number; yearlyPrice: number; ecoSetPrice: number; proSetPrice: number;
      }>('/api/payments/pricing', { auth: true }),
      requestData<SystemStats>('/api/subscription/admin/stats'),
    ])
      .then(([pricingRes, statsData]) => {
        if (pricingRes.success && pricingRes.data) {
          setForm({
            monthlyPrice: pricingRes.data.monthlyPrice,
            yearlyPrice: pricingRes.data.yearlyPrice,
            ecoSetPrice: pricingRes.data.ecoSetPrice,
            proSetPrice: pricingRes.data.proSetPrice,
          });
        }
        setStats(statsData);
      })
      .catch((err: any) => {
        setErrorText(err?.message || 'Yonetim verisi yuklenirken hata olustu.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const intValue = parseInt(value, 10);
    setForm((prev) => ({ ...prev, [name]: isNaN(intValue) ? 0 : intValue }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText(null);
    try {
      const res = await requestEnvelope<{ monthlyPrice: number; yearlyPrice: number; ecoSetPrice: number; proSetPrice: number }>(
        '/api/payments/pricing', { auth: true, method: 'POST', body: form },
      );
      if (res.success && res.data) {
        onSetBanner({ text: 'Fiyatlandirma ayarlari basariyla guncellendi.', type: 'success' });
        setTimeout(() => onSetBanner(null), 4000);
      } else {
        setErrorText('Ayarlar kaydedilemedi.');
      }
    } catch (err: any) {
      setErrorText(err?.message || 'Bir sunucu hatasi olustu.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <section className="panel-grid">
        <article className="card"><p className="muted">Yukleniyor...</p></article>
      </section>
    );
  }

  return (
    <section className="panel-grid">
      {errorText && <div className="banner error">{errorText}</div>}

      {/* System-wide metrics */}
      <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2>Sistem Genel Durumu</h2>
        {stats && (
          <div className="metric-grid" style={{ marginTop: '0' }}>
            <div className="metric-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
              <span>Toplam Firma</span>
              <strong>{stats.companies.total}</strong>
            </div>
            <div className="metric-card" style={{ borderLeft: '4px solid #10b981' }}>
              <span>Aktif</span>
              <strong>{stats.companies.ACTIVE}</strong>
            </div>
            <div className="metric-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <span>Ek Sure (Grace)</span>
              <strong>{stats.companies.GRACE}</strong>
            </div>
            <div className="metric-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <span>Sure Dolmus</span>
              <strong>{stats.companies.EXPIRED}</strong>
            </div>
            <div className="metric-card" style={{ borderLeft: '4px solid #6b7280' }}>
              <span>Askida</span>
              <strong>{stats.companies.SUSPENDED}</strong>
            </div>
            <div className="metric-card" style={{ borderLeft: '4px solid #3b82f6' }}>
              <span>Lisanssiz</span>
              <strong>{stats.companies.UNCONFIGURED}</strong>
            </div>
            <div className="metric-card" style={{ borderLeft: '4px solid #a855f7' }}>
              <span>Kullanici</span>
              <strong>{stats.users.total}</strong>
            </div>
            <div className="metric-card" style={{ borderLeft: '4px solid #ec4899' }}>
              <span>Sube</span>
              <strong>{stats.branches.total}</strong>
            </div>
          </div>
        )}
      </article>

      {/* Pricing management */}
      <div className="sub-layout-grid">
        <article className="card">
          <h2>Fiyatlandirma Yonetimi</h2>
          <p className="muted">Acılıs sayfasinda gosterilen paket fiyatlarini guncelleyin.</p>

          {errorText && (
            <div className="banner error" style={{ marginBottom: '16px' }}>{errorText}</div>
          )}

          <form className="form-grid compact" onSubmit={handleSubmit}>
            <label>
              Aylik Lisans (TL)
              <input type="number" name="monthlyPrice" value={form.monthlyPrice} onChange={handleInputChange} min={0} required />
            </label>
            <label>
              Yillik Lisans Aylik Esdeger (TL)
              <input type="number" name="yearlyPrice" value={form.yearlyPrice} onChange={handleInputChange} min={0} required />
            </label>
            <label>
              Eko Donanim Seti (TL)
              <input type="number" name="ecoSetPrice" value={form.ecoSetPrice} onChange={handleInputChange} min={0} required />
            </label>
            <label>
              Pro Donanim Seti (TL)
              <input type="number" name="proSetPrice" value={form.proSetPrice} onChange={handleInputChange} min={0} required />
            </label>
            <button type="submit" className="btn primary" disabled={loading || saving} style={{ width: '100%' }}>
              {loading ? 'Guncelleniyor...' : 'Fiyatlari Kaydet ve Yayinla'}
            </button>
          </form>
        </article>

        <article className="card">
          <h2>Hizli Erisim</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <Link to="/subscription" className="btn" style={{ textDecoration: 'none', textAlign: 'center' }}>
              Paket & Lisans Yonetimi
            </Link>
            <Link to="/audit" className="btn" style={{ textDecoration: 'none', textAlign: 'center' }}>
              Denetim Kaydi (Audit Log)
            </Link>
            <Link to="/setup" className="btn" style={{ textDecoration: 'none', textAlign: 'center' }}>
              Firma Kurulum Wizard
            </Link>
          </div>

          <div style={{ background: 'var(--bg-2)', padding: '12px', borderRadius: '8px', marginTop: '16px', fontSize: '12px', color: 'var(--fg-3)' }}>
            <strong>Bilgi:</strong> Fiyat degisiklikleri mevcut aboneleri etkilemez, sadece yeni kayitlar icin gecerlidir.
          </div>
        </article>
      </div>

      {/* Role Permission Matrix */}
      <article className="card">
        <h2>Yetki Matrisi (Role-Based Access)</h2>
        <p className="muted">Her rolun erisebildigi modul ve islemler. Kesin tanimlayici rol-permission haritasidir.</p>
        <div className="table-wrap" style={{ marginTop: '12px' }}>
          <table style={{ fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th>Yetki</th>
                {Object.keys(ROLE_PERMISSIONS).map((role) => (
                  <th key={role} style={{ textAlign: 'center' }}>{role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.map((perm) => (
                <tr key={perm}>
                  <td style={{ fontWeight: 500 }}>{perm}</td>
                  {Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => (
                    <td key={role} style={{ textAlign: 'center' }}>
                      {perms.includes(perm) ? (
                        <span style={{ color: '#10b981', fontSize: '1.1rem' }}>✓</span>
                      ) : (
                        <span style={{ color: 'var(--fg-4)', fontSize: '0.9rem' }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
