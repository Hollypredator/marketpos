import React from 'react';
import { useNavigate } from 'react-router-dom';

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToSuccess?: (companyId: string) => void;
}

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: 'Offline Çalışma',
    desc: 'İnternet yoksa bile satış yapmaya devam edin. Bağlantı geldiğinde otomatik senkronize olur.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
    title: '4000+ Ürün Kataloğu',
    desc: 'Tekel, market, büfe için hazır stok şablonları. Tek tıkla kurulum.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Çoklu Şube',
    desc: 'Tüm şubelerinizi tek panelden yönetin. Merkezi stok ve satış takibi.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    title: '365 Gün Offline',
    desc: 'Lisans aktivasyonundan sonra 1 yıl internet gerekmez. Tam bağımsız çalışma.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 14l2 2 4-4" />
      </svg>
    ),
    title: 'Vereşiye & Cari',
    desc: 'Müşterilerinize vereşiye verin, borç/alacak takibi yapın.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: 'Raporlar & Analiz',
    desc: 'Günlük satış, kârlılık, stok analizi, şube karşılaştırma raporları.',
  },
];

const STEPS = [
  { num: '1', title: 'Kurulum', desc: 'Bilgisayara kurun ve lisansınızı girin.' },
  { num: '2', title: 'Stok Girin', desc: 'Hazır şablonu seçin veya kendi listenizi yükleyin.' },
  { num: '3', title: 'Satışa Başlayın', desc: 'Barkod okutun, satış yapın, raporları takip edin.' },
];

export function LandingPage({ onNavigateToLogin }: LandingPageProps): React.ReactElement {
  return (
    <div className="landing">
      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <div className="landing-logo">M</div>
            <span className="landing-brand-name">MarketPOS</span>
          </div>
          <div className="landing-nav-links">
            <a href="#ozellikler">Özellikler</a>
            <a href="#nasil-calisir">Nasıl Çalışır</a>
            <button className="btn landing-login-btn" onClick={onNavigateToLogin}>Giriş Yap</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="landing-hero-badge">Yeni Nesil POS Sistemi</div>
        <h1 className="landing-hero-title">
          Marketiniz için<br />
          <span className="landing-hero-accent">akıllı POS</span> çözümü
        </h1>
        <p className="landing-hero-sub">
          Offline çalışabilen, 4000+ ürün kataloğu ile hazır, çoklu şube destekli
          yazarkasa POS sistemi. Kurulumu 5 dakika, kullanımı çok kolay.
        </p>
        <div className="landing-hero-actions">
          <button className="btn landing-cta" onClick={onNavigateToLogin}>Hemen Başlayın</button>
          <a href="#ozellikler" className="btn landing-cta-secondary">Daha Fazla Bilgi</a>
        </div>

        {/* Stats */}
        <div className="landing-stats">
          <div className="landing-stat">
            <strong>4.000+</strong>
            <span>Ürün Kataloğu</span>
          </div>
          <div className="landing-stat">
            <strong>365</strong>
            <span>Gün Offline</span>
          </div>
          <div className="landing-stat">
            <strong>5 dk</strong>
            <span>Kurulum Süresi</span>
          </div>
          <div className="landing-stat">
            <strong>%99.9</strong>
            <span>Uptime</span>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="landing-section" id="ozellikler">
        <div className="landing-section-header">
          <h2>Güçlü Özellikler</h2>
          <p>İşinizi büyütmeniz için ihtiyacınız olan her şey tek bir yerde.</p>
        </div>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature-card">
              <div className="landing-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="landing-section landing-section-alt" id="nasil-calisir">
        <div className="landing-section-header">
          <h2>3 Kolay Adım</h2>
          <p>Sıfırdan satışa 5 dakikada geçin.</p>
        </div>
        <div className="landing-steps">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.num}>
              {i > 0 && <div className="landing-step-connector" />}
              <div className="landing-step">
                <div className="landing-step-num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="landing-section landing-cta-section">
        <h2>İşinizi Dijitalleştirmeye Hazır mısınız?</h2>
        <p>Hemen başlayın, ilk 30 gün ücretsiz deneyin.</p>
        <button className="btn landing-cta" onClick={onNavigateToLogin}>Ücretsiz Başla</button>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <div className="landing-logo" style={{ width: 20, height: 20, fontSize: 10 }}>M</div>
            <span>MarketPOS</span>
          </div>
          <p className="landing-footer-copy">&copy; 2026 MarketPOS. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </div>
  );
}
