import React, { useState, useEffect } from 'react';
import { requestEnvelope } from '../lib/http/api-client';

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToSuccess: (companyId: string) => void;
}

type PresetType = 'RETAIL' | 'CAFE' | 'KASAP';

export function LandingPage({ onNavigateToLogin, onNavigateToSuccess }: LandingPageProps): React.ReactElement {
  // Preset Selection State
  const [activePreset, setActivePreset] = useState<PresetType>('RETAIL');

  // Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'MONTHLY' | 'YEARLY' | 'ECO_SET' | 'PRO_SET'>('MONTHLY');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Dynamic Pricing State
  const [pricing, setPricing] = useState({
    monthlyPrice: 490,
    yearlyPrice: 390,
    ecoSetPrice: 24900,
    proSetPrice: 39900,
  });

  useEffect(() => {
    requestEnvelope<{
      monthlyPrice: number;
      yearlyPrice: number;
      ecoSetPrice: number;
      proSetPrice: number;
    }>('/api/payments/pricing', { auth: false })
      .then((res) => {
        if (res.success && res.data) {
          setPricing(res.data);
        }
      })
      .catch(() => {});
  }, []);

  // Form State
  const [form, setForm] = useState({
    companyName: '',
    adminFullName: '',
    adminEmail: '',
    adminUsername: 'admin',
    adminPassword: '',
    templateCode: 'bakkal-v1',
  });

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const openOnboarding = (plan: 'MONTHLY' | 'YEARLY' | 'ECO_SET' | 'PRO_SET') => {
    setSelectedPlan(plan);
    setIsModalOpen(true);
    setErrorText(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText(null);

    try {
      const response = await requestEnvelope<{ checkoutUrl: string; companyId: string }>(
        '/api/payments/checkout',
        {
          auth: false,
          method: 'POST',
          body: {
            ...form,
            planType: selectedPlan,
          },
        }
      );

      if (response.success && response.data?.checkoutUrl) {
        // Track the companyId in local storage or pass via success page
        const companyId = response.data.companyId;
        
        // Wait a small moment then redirect the user to LemonSqueezy Checkout
        window.location.href = response.data.checkoutUrl;
      } else {
        setErrorText('Kayıt oluşturulamadı, lütfen bilgileri kontrol edin.');
      }
    } catch (err: any) {
      setErrorText(err?.message || 'Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-container">
      {/* Scope-specific Styles (Sleek dark-mode violet aesthetics) */}
      <style>{`
        .landing-container {
          width: 100%;
          min-height: 100vh;
          background-color: var(--bg-0);
          color: var(--fg-2);
          overflow-y: auto;
          position: relative;
          scroll-behavior: smooth;
        }
        
        /* Background Glows */
        .landing-glow {
          position: absolute;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(113, 112, 255, 0.08) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }
        .landing-glow-1 { top: -200px; right: -100px; }
        .landing-glow-2 { top: 800px; left: -200px; }
        .landing-glow-3 { bottom: -100px; right: -100px; }

        /* Header */
        .landing-header {
          position: sticky;
          top: 0;
          height: 64px;
          background: rgba(8, 9, 10, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border-s);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 40px;
          z-index: 100;
        }
        .logo-container {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo-icon {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-v) 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          color: #fff;
          font-size: 16px;
          box-shadow: 0 0 15px rgba(94, 106, 210, 0.3);
        }
        .logo-text {
          font-size: 18px;
          font-weight: 600;
          color: var(--fg-1);
          letter-spacing: -0.5px;
        }
        .landing-nav {
          display: flex;
          align-items: center;
          gap: 28px;
        }
        .nav-link {
          color: var(--fg-3);
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: color 0.2s;
        }
        .nav-link:hover {
          color: var(--fg-1);
        }

        /* Hero */
        .landing-hero {
          max-width: 1200px;
          margin: 0 auto;
          padding: 80px 40px 60px;
          text-align: center;
          position: relative;
          z-index: 1;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(113, 112, 255, 0.1);
          border: 1px solid rgba(113, 112, 255, 0.2);
          color: var(--accent-h);
          font-size: 12px;
          font-weight: 500;
          padding: 4px 12px;
          border-radius: 99px;
          margin-bottom: 24px;
        }
        .hero-title {
          font-size: 48px;
          font-weight: 600;
          line-height: 1.15;
          color: var(--fg-1);
          max-width: 800px;
          margin: 0 auto 20px;
          letter-spacing: -1px;
        }
        .hero-gradient-text {
          background: linear-gradient(135deg, #fff 30%, var(--accent-h) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-desc {
          font-size: 16px;
          color: var(--fg-3);
          max-width: 600px;
          margin: 0 auto 36px;
          line-height: 1.6;
        }
        .hero-ctas {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-bottom: 60px;
        }
        .btn-large {
          padding: 10px 24px;
          font-size: 14px;
          font-weight: 500;
          border-radius: var(--r-lg);
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .btn-large.primary {
          background: var(--accent);
          border: 1px solid var(--accent);
          color: #fff;
          box-shadow: 0 4px 20px rgba(94, 106, 210, 0.35);
        }
        .btn-large.primary:hover {
          background: var(--accent-h);
          border-color: var(--accent-h);
          transform: translateY(-1px);
        }
        .btn-large.secondary {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border);
          color: var(--fg-2);
        }
        .btn-large.secondary:hover {
          background: rgba(255, 255, 255, 0.07);
          color: var(--fg-1);
          transform: translateY(-1px);
        }

        /* Mockup Glass Container */
        .hero-mockup {
          max-width: 900px;
          margin: 0 auto;
          background: rgba(25, 26, 27, 0.4);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          padding: 6px;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
          position: relative;
          overflow: hidden;
        }
        .mockup-inner {
          background: var(--bg-1);
          border-radius: calc(var(--r-xl) - 4px);
          aspect-ratio: 16/10;
          border: 1px solid var(--border-s);
          overflow: hidden;
          position: relative;
          display: flex;
          flex-direction: column;
        }
        
        /* POS App Mockup UI */
        .mockup-topbar {
          height: 36px;
          background: var(--bg-2);
          border-bottom: 1px solid var(--border-s);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          font-size: 11px;
          color: var(--fg-3);
        }
        .mockup-body {
          flex: 1;
          display: grid;
          grid-template-columns: 3fr 2fr;
          overflow: hidden;
          background: var(--bg-0);
        }
        .mockup-left {
          border-right: 1px solid var(--border-s);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mockup-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          flex: 1;
        }
        .mockup-card {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 8px;
          font-size: 11px;
          text-align: left;
        }
        .mockup-card-title { font-weight: 500; color: var(--fg-1); }
        .mockup-card-price { color: var(--accent-h); font-weight: 600; margin-top: auto; }
        
        .mockup-right {
          background: var(--bg-1);
          padding: 12px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .mockup-receipt {
          flex: 1;
          background: var(--bg-0);
          border: 1px solid var(--border-s);
          border-radius: var(--r-sm);
          padding: 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--fg-3);
          text-align: left;
          margin-bottom: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .mockup-btn {
          height: 36px;
          background: var(--accent);
          color: #fff;
          border: none;
          border-radius: var(--r-md);
          font-weight: 600;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Stats */
        .landing-stats {
          background: rgba(255, 255, 255, 0.01);
          border-top: 1px solid var(--border-s);
          border-bottom: 1px solid var(--border-s);
          padding: 40px 20px;
          position: relative;
          z-index: 1;
        }
        .stats-grid {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 30px;
        }
        .stat-item {
          text-align: center;
        }
        .stat-num {
          font-size: 36px;
          font-weight: 600;
          color: var(--fg-1);
          background: linear-gradient(135deg, #fff 40%, var(--accent-h) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 6px;
        }
        .stat-label {
          font-size: 12px;
          color: var(--fg-3);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* Presets Showcase Section */
        .landing-presets {
          max-width: 1200px;
          margin: 80px auto;
          padding: 0 40px;
          text-align: center;
          position: relative;
          z-index: 1;
        }
        .section-header {
          margin-bottom: 40px;
        }
        .section-title {
          font-size: 32px;
          color: var(--fg-1);
          font-weight: 600;
          margin-bottom: 12px;
          letter-spacing: -0.5px;
        }
        .section-desc {
          font-size: 14px;
          color: var(--fg-3);
          max-width: 500px;
          margin: 0 auto;
        }
        
        .presets-toggle {
          display: inline-flex;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          padding: 4px;
          margin-bottom: 30px;
        }
        .presets-btn {
          background: transparent;
          border: none;
          color: var(--fg-3);
          font-size: 13px;
          font-weight: 500;
          padding: 8px 18px;
          border-radius: var(--r-md);
          cursor: pointer;
          transition: all 0.2s;
        }
        .presets-btn.active {
          background: var(--accent);
          color: #fff;
          box-shadow: 0 4px 12px rgba(94, 106, 210, 0.2);
        }

        .preset-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          padding: 30px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          text-align: left;
          align-items: center;
        }
        .preset-info h3 { font-size: 24px; color: var(--fg-1); margin-bottom: 12px; }
        .preset-info p { color: var(--fg-3); line-height: 1.6; margin-bottom: 20px; font-size: 14px; }
        .preset-tag-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .preset-tag {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-s);
          padding: 4px 10px;
          border-radius: var(--r-sm);
          font-size: 11px;
          color: var(--fg-3);
        }

        /* Features */
        .landing-features {
          max-width: 1200px;
          margin: 80px auto;
          padding: 0 40px;
          position: relative;
          z-index: 1;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .feature-card {
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          padding: 24px;
          transition: transform 0.2s, border-color 0.2s;
        }
        .feature-card:hover {
          transform: translateY(-2px);
          border-color: rgba(113, 112, 255, 0.3);
          background: rgba(255, 255, 255, 0.025);
        }
        .feature-icon-wrapper {
          width: 40px;
          height: 40px;
          background: rgba(113, 112, 255, 0.1);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-h);
          margin-bottom: 16px;
        }
        .feature-card-title {
          font-size: 15px;
          font-weight: 500;
          color: var(--fg-1);
          margin-bottom: 8px;
        }
        .feature-card-desc {
          font-size: 12px;
          color: var(--fg-3);
          line-height: 1.5;
        }

        /* Pricing */
        .pricing-grid {
          display: flex;
          justify-content: center;
          gap: 24px;
          max-width: 1100px;
          margin: 0 auto;
        }
        .pricing-card {
          flex: 1;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          padding: 30px 24px;
          text-align: left;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: border-color 0.2s, transform 0.2s;
        }
        .pricing-card:hover {
          border-color: rgba(113, 112, 255, 0.3);
          transform: translateY(-2px);
        }
        .pricing-card.premium {
          border-color: var(--accent);
          background: linear-gradient(180deg, rgba(94, 106, 210, 0.05) 0%, rgba(0,0,0,0) 100%), rgba(255,255,255, 0.02);
        }
        .pricing-card.premium::after {
          content: 'EN POPÜLER';
          position: absolute;
          top: 16px;
          right: 16px;
          background: var(--accent);
          color: #fff;
          font-size: 9px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 99px;
          letter-spacing: 0.05em;
        }
        .plan-name { font-size: 16px; font-weight: 500; color: var(--fg-1); margin-bottom: 8px; }
        .plan-desc { font-size: 12px; color: var(--fg-3); margin-bottom: 24px; }
        .plan-price-row { display: flex; align-items: baseline; gap: 4px; margin-bottom: 24px; }
        .plan-price { font-size: 32px; font-weight: 600; color: var(--fg-1); }
        .plan-period { font-size: 13px; color: var(--fg-4); }
        .plan-features { list-style: none; display: flex; flex-direction: column; gap: 10px; margin-bottom: 32px; flex: 1; }
        .plan-feature-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--fg-2); }
        .plan-feature-item svg { color: var(--green); flex-shrink: 0; }
        .btn-pricing {
          width: 100%;
          height: 38px;
          border-radius: var(--r-md);
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.03);
          color: var(--fg-2);
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pricing-card.premium .btn-pricing {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
          box-shadow: 0 4px 15px rgba(94, 106, 210, 0.3);
        }
        .pricing-card.premium .btn-pricing:hover {
          background: var(--accent-h);
          border-color: var(--accent-h);
        }
        .pricing-card:not(.premium) .btn-pricing:hover {
          background: rgba(255, 255, 255, 0.06);
          color: var(--fg-1);
        }

        /* FAQ Accordion */
        .landing-faq {
          max-width: 800px;
          margin: 80px auto;
          padding: 0 40px;
          position: relative;
          z-index: 1;
        }
        .faq-list { display: flex; flex-direction: column; gap: 12px; }
        .faq-item {
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          overflow: hidden;
        }
        .faq-q {
          padding: 16px 20px;
          width: 100%;
          background: transparent;
          border: none;
          color: var(--fg-2);
          font-weight: 500;
          font-size: 14px;
          text-align: left;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .faq-q:hover { color: var(--fg-1); }
        .faq-q svg { transition: transform 0.2s; }
        .faq-q.open svg { transform: rotate(180deg); }
        .faq-a {
          padding: 0 20px 16px;
          font-size: 12px;
          color: var(--fg-3);
          line-height: 1.6;
        }

        /* Modal / Onboarding Form */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal-container {
          background: var(--bg-1);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          width: 100%;
          max-width: 500px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5);
          overflow: hidden;
        }
        .modal-header {
          padding: 18px 24px;
          border-bottom: 1px solid var(--border-s);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-title { font-size: 15px; font-weight: 600; color: var(--fg-1); }
        .modal-close {
          background: transparent; border: none; color: var(--fg-4); cursor: pointer; font-size: 18px;
        }
        .modal-close:hover { color: var(--fg-1); }
        .modal-body { padding: 24px; }
        
        .form-help {
          font-size: 11px;
          color: var(--fg-4);
          margin-top: 2px;
        }
        .modal-banner {
          margin-bottom: 16px;
        }

        /* Footer */
        .landing-footer {
          border-top: 1px solid var(--border-s);
          padding: 40px 20px;
          text-align: center;
          font-size: 12px;
          color: var(--fg-4);
          position: relative;
          z-index: 1;
        }
      `}</style>

      {/* Decorative Glow Elements */}
      <div className="landing-glow landing-glow-1"></div>
      <div className="landing-glow landing-glow-2"></div>
      <div className="landing-glow landing-glow-3"></div>

      {/* Sticky Header */}
      <header className="landing-header">
        <div className="logo-container">
          <div className="logo-icon">M</div>
          <span className="logo-text">MarketPOS</span>
        </div>
        <nav className="landing-nav">
          <a href="#features" className="nav-link">Özellikler</a>
          <a href="#presets" className="nav-link">Presetler</a>
          <a href="#pricing" className="nav-link">Fiyatlandırma</a>
          <a href="#faq" className="nav-link">SSS</a>
          <button className="btn primary" onClick={onNavigateToLogin}>Giriş Yap</button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="hero-badge">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Saha Pilotları Tarafından Test Edilmiş En Kararlı POS Sürümü
        </div>
        <h1 className="hero-title">
          Bulut Entegrasyonlu, <span className="hero-gradient-text">Çevrimdışı Çalışabilen</span> Yeni Nesil POS Sistemi
        </h1>
        <p className="hero-desc">
          İnternet kesintilerinde bile sıfır gecikmeyle satışa devam edin. MarketPOS, esnek altyapısı, devasa hazır barkod kütüphanesi ve çoklu şube desteğiyle işletmenizi geleceğe taşır.
        </p>
        <div className="hero-ctas">
          <a href="#pricing" className="btn-large primary">
            Hemen Abone Ol
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </a>
          <a href="https://marketpos-releases.s3.eu-central-1.amazonaws.com/MarketPOS-Setup-1.0.0.exe" className="btn-large secondary">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            .exe Dosyası İndir
          </a>
        </div>

        {/* Live CSS Interactive Mockup */}
        <div className="hero-mockup">
          <div className="mockup-inner">
            <div className="mockup-topbar">
              <span>MarketPOS Desktop App v1.0.0</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span className="state-pill ok" style={{ fontSize: '9px', padding: '1px 6px' }}>OFFLINE AKTİF</span>
                <span>Kasa: K01 (Merkez Şube)</span>
              </div>
            </div>
            <div className="mockup-body">
              <div className="mockup-left">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--fg-1)' }}>Hızlı Ürünler</span>
                  <span style={{ fontSize: '10px', color: 'var(--fg-4)' }}>Barkod okutun veya tıklayın</span>
                </div>
                <div className="mockup-grid">
                  <div className="mockup-card">
                    <span className="mockup-card-title">Ekmek 250g</span>
                    <span className="mockup-card-price">10.00 TL</span>
                  </div>
                  <div className="mockup-card">
                    <span className="mockup-card-title">Coca Cola 1L</span>
                    <span className="mockup-card-price">35.00 TL</span>
                  </div>
                  <div className="mockup-card">
                    <span className="mockup-card-title">Yumurta 30lu</span>
                    <span className="mockup-card-price">120.00 TL</span>
                  </div>
                  <div className="mockup-card">
                    <span className="mockup-card-title">Süt 1L (Yarım)</span>
                    <span className="mockup-card-price">28.00 TL</span>
                  </div>
                  <div className="mockup-card">
                    <span className="mockup-card-title">Makarna 500g</span>
                    <span className="mockup-card-price">15.00 TL</span>
                  </div>
                  <div className="mockup-card">
                    <span className="mockup-card-title">Çikolata Kare</span>
                    <span className="mockup-card-price">24.50 TL</span>
                  </div>
                  <div className="mockup-card">
                    <span className="mockup-card-title">Cips Aile Boy</span>
                    <span className="mockup-card-price">42.00 TL</span>
                  </div>
                  <div className="mockup-card">
                    <span className="mockup-card-title">Maden Suyu 6lı</span>
                    <span className="mockup-card-price">30.00 TL</span>
                  </div>
                </div>
              </div>
              <div className="mockup-right">
                <div className="mockup-receipt">
                  <div style={{ borderBottom: '1px dashed var(--border)', paddingBottom: '4px', marginBottom: '6px', textAlign: 'center', fontWeight: 'bold' }}>
                    MARKETPOS SATIŞ FİŞİ
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>1x Coca Cola 1L</span>
                    <span>35.00 TL</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>1x Ekmek 250g</span>
                    <span>10.00 TL</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>2x Makarna 500g</span>
                    <span>30.00 TL</span>
                  </div>
                  <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: 'var(--fg-1)' }}>
                    <span>TOPLAM</span>
                    <span>75.00 TL</span>
                  </div>
                </div>
                <button className="mockup-btn" onClick={() => alert('Demo Kasa Satış Tamamlandı!')}>FİŞİ KES / ÖDEME AL (F12)</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Counter Section */}
      <section className="landing-stats">
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-num">&lt; 10ms</div>
            <div className="stat-label">Barkod Okuma Gecikmesi</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">4000+</div>
            <div className="stat-label">Hazır Ürün Preset Barkodu</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">100%</div>
            <div className="stat-label">Çevrimdışı Çalışma Garantisi</div>
          </div>
          <div className="stat-item">
            <div className="stat-num">365 Gün</div>
            <div className="stat-label">Yerel Çevrimdışı Lisans Grace Süresi</div>
          </div>
        </div>
      </section>

      {/* Business Presets Section */}
      <section id="presets" className="landing-presets">
        <div className="section-header">
          <h2 className="section-title">İşletmenize Tam Uyum Sağlayan Yapı</h2>
          <p className="section-desc">Kasa kurulum sihirbazında seçtiğiniz sektöre göre hazır ürünler, KDV oranları ve arayüz şablonu otomatik olarak yüklenir.</p>
        </div>

        <div className="presets-toggle">
          <button className={`presets-btn ${activePreset === 'RETAIL' ? 'active' : ''}`} onClick={() => setActivePreset('RETAIL')}>Market / Bakkal</button>
          <button className={`presets-btn ${activePreset === 'CAFE' ? 'active' : ''}`} onClick={() => setActivePreset('CAFE')}>Cafe / Fast Food</button>
          <button className={`presets-btn ${activePreset === 'KASAP' ? 'active' : ''}`} onClick={() => setActivePreset('KASAP')}>Kasap / Şarküteri</button>
        </div>

        {activePreset === 'RETAIL' && (
          <div className="preset-card">
            <div className="preset-info">
              <h3>Market & Bakkal Şablonu</h3>
              <p>Temel gıda, içecek, kozmetik, temizlik ve atıştırmalık gibi kategorilerde 4000'den fazla popüler ürünün güncel barkod ve KDV oranları hazır olarak gelir. Sadece barkodu okutup anında satış yapmaya başlarsınız.</p>
              <div className="preset-tag-list">
                <span className="preset-tag">4K+ Hazır Barkod</span>
                <span className="preset-tag">KDV Oranları Hazır</span>
                <span className="preset-tag">Hızlı Sepet</span>
                <span className="preset-tag">Fiyat Gör Desteği</span>
              </div>
            </div>
            <div style={{ padding: '20px', background: 'var(--bg-2)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-s)' }}>
              <div style={{ fontWeight: '500', marginBottom: '10px', color: 'var(--fg-1)' }}>Hazır Market Kategorileri</div>
              <ul style={{ fontSize: '12px', color: 'var(--fg-3)', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>🛒 Temel Gıda & Ekmek (%1 KDV)</li>
                <li>🥤 Gazlı & Gazsız İçecekler (%10 KDV)</li>
                <li>🧼 Temizlik & Hijyen (%20 KDV)</li>
                <li>🍫 Atıştırmalık & Çikolata (%10 KDV)</li>
              </ul>
            </div>
          </div>
        )}

        {activePreset === 'CAFE' && (
          <div className="preset-card">
            <div className="preset-info">
              <h3>Cafe & Fast Food Şablonu</h3>
              <p>Barkodu olmayan ve hızlı satılması gereken çay, kahve, tost, burger gibi sıcak/soğuk menü ürünlerini tek dokunuşla sepete ekleyebilmeniz için optimize edilmiştir. Kolaylaştırılmış hızlı ürün paneli ile kasada kuyrukları önler.</p>
              <div className="preset-tag-list">
                <span className="preset-tag">Dokunmatik Buton Grid</span>
                <span className="preset-tag">Menü Gruplandırma</span>
                <span className="preset-tag">Parçalı Ödeme (Split)</span>
                <span className="preset-tag">Özelleştirilebilir Renkler</span>
              </div>
            </div>
            <div style={{ padding: '20px', background: 'var(--bg-2)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-s)' }}>
              <div style={{ fontWeight: '500', marginBottom: '10px', color: 'var(--fg-1)' }}>Hazır Hızlı Menü Butonları</div>
              <ul style={{ fontSize: '12px', color: 'var(--fg-3)', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>☕ Sıcak İçecekler (Çay, Latte, Espresso)</li>
                <li>🥪 Hızlı Atıştırmalıklar (Tost, Sandviç)</li>
                <li>🍔 Menüler (Burger, Patates, Kola)</li>
                <li>🍰 Tatlılar (Pasta, Waffle, Dondurma)</li>
              </ul>
            </div>
          </div>
        )}

        {activePreset === 'KASAP' && (
          <div className="preset-card">
            <div className="preset-info">
              <h3>Kasap & Şarküteri Şablonu</h3>
              <p>Ağırlık ölçümlü barkod formatlarına tam uyumludur. Terazi fişlerindeki ağırlığı ve ürün kodunu anında çözümleyerek sepete otomatik ekler. Şarküteri ve kasap reyonları için hassas miktar satışı sağlar.</p>
              <div className="preset-tag-list">
                <span className="preset-tag">Terazi Barkod Çözümleyici</span>
                <span className="preset-tag">Gramajlı Hassas Satış</span>
                <span className="preset-tag">Müşteri Açık Hesap</span>
                <span className="preset-tag">Alış Fiyatı Kar Takibi</span>
              </div>
            </div>
            <div style={{ padding: '20px', background: 'var(--bg-2)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border-s)' }}>
              <div style={{ fontWeight: '500', marginBottom: '10px', color: 'var(--fg-1)' }}>Terazi Entegrasyon Formatları</div>
              <ul style={{ fontSize: '12px', color: 'var(--fg-3)', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>⚖️ EAN-13 (27 ve 29 ile başlayan gramajlı)</li>
                <li>🥩 Parça Kırmızı Et & Kıyma Reyonu</li>
                <li>🧀 Şarküteri Reyonları (Peynir, Zeytin)</li>
                <li>💰 Açık Hesap Veresiye Defteri Takibi</li>
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Features Grid Section */}
      <section id="features" className="landing-features">
        <div className="section-header" style={{ textAlign: 'center' }}>
          <h2 className="section-title">İhtiyacınız Olan Tüm Özellikler Tek Çatı Altında</h2>
          <p className="section-desc">Kasada hızlı satış, arka ofiste şube ve stok yönetimi ile işletmenizin tüm süreçlerini uçtan uca kontrol edin.</p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <h3 className="feature-card-title">Çevrimdışı Kesintisiz Satış</h3>
            <p className="feature-card-desc">İnternet bağlantınız kopsa dahi yerel SQLite veritabanı sayesinde satış, fiş kesme, iade işlemleriniz aksamaz. Bağlantı geldiğinde verileriniz otomatik senkronize olur.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <h3 className="feature-card-title">Çoklu Şube & Kasa Yönetimi</h3>
            <p className="feature-card-desc">Bulut backoffice paneli üzerinden tüm şubelerinizi, şubelere bağlı kasalarınızı, personel yetkilerini ve anlık satış raporlarını tek bir merkezden takip edin.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            </div>
            <h3 className="feature-card-title">Hızlı Stok & Barkod Girişi</h3>
            <p className="feature-card-desc">Yeni ürünlerinizi veya stok girişlerinizi barkod okutarak saniyeler içinde yapın. Kritik stok uyarıları ile rafınızda hiçbir ürünün tükenmesine izin vermeyin.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <h3 className="feature-card-title">Offline Güvenlik & Anti-Tamper</h3>
            <p className="feature-card-desc">Cihaz saatini geri alma koruması, kriptografik lisans imzaları ve yerel veritabanı şifrelemesi ile kasadaki tüm işlemleriniz ve verileriniz güvence altındadır.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            </div>
            <h3 className="feature-card-title">Donanım Desteği</h3>
            <p className="feature-card-desc">ESC/POS uyumlu tüm USB ve Ethernet termal fiş yazıcıları, barkod okuyucuları ve para çekmecelerini ekstra bir sürücü gerekmeden doğrudan çalıştırın.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            </div>
            <h3 className="feature-card-title">Otomatik Yerel Yedekleme</h3>
            <p className="feature-card-desc">Uygulama arka planda veritabanınızı belirlediğiniz aralıklarla yedekler. Beklenmeyen bilgisayar arızalarında dahi verileriniz asla kaybolmaz.</p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="landing-pricing" style={{ maxWidth: '1200px', margin: '80px auto', padding: '0 40px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div className="section-header">
          <h2 className="section-title">Esnek ve Şeffaf Fiyatlandırma</h2>
          <p className="section-desc">Yalnızca yazılım lisansına mı ihtiyacınız var yoksa bilgisayar, barkod okuyucu, fiş yazıcı ve yazarkasa POS içeren tam bir set kurulumuna mı? İşletmenize en uygun olanı seçin.</p>
        </div>

        <div className="pricing-grid">
          {/* Software Only Plan */}
          <div className="pricing-card">
            <div className="plan-name">Sadece Yazılım Lisansı</div>
            <div className="plan-desc">Mevcut bilgisayarı ve donanımı olan işletmeler için bulut lisans seçeneği.</div>
            <div className="plan-price-row">
              <span className="plan-price">{pricing.monthlyPrice.toLocaleString('tr-TR')} TL</span>
              <span className="plan-period">/ Ay veya {pricing.yearlyPrice.toLocaleString('tr-TR')} TL / Ay (Yıllık)</span>
            </div>
            <ul className="plan-features">
              <li className="plan-feature-item">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Tam Çevrimdışı (Offline) Satış Altyapısı
              </li>
              <li className="plan-feature-item">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Bulut Backoffice Şube, Stok & Cari Takibi
              </li>
              <li className="plan-feature-item">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Sınırsız Güncelleme ve Otomatik Yedekleme
              </li>
              <li className="plan-feature-item">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Mevcut ESC/POS Yazıcı ve Okuyucularla Uyum
              </li>
              <li className="plan-feature-item">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Uzaktan Hızlı Kurulum & Teknik Destek
              </li>
            </ul>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
              <button className="btn-pricing" onClick={() => openOnboarding('MONTHLY')}>Aylık Planla Başla</button>
              <button className="btn-pricing" style={{ background: 'rgba(113, 112, 255, 0.1)', borderColor: 'rgba(113, 112, 255, 0.3)', color: 'var(--accent-h)' }} onClick={() => openOnboarding('YEARLY')}>Yıllık Abone Ol (20% İndirim)</button>
            </div>
          </div>

          {/* Eco Hardware Set */}
          <div className="pricing-card premium">
            <div className="plan-name">Eko Tam Donanım Seti</div>
            <div className="plan-desc">Bakkal, market ve manavlar için tak-çalıştır donanım + yazılım tam paket.</div>
            <div className="plan-price-row">
              <span className="plan-price" style={{ fontSize: '28px' }}>{pricing.ecoSetPrice.toLocaleString('tr-TR')} TL</span>
              <span className="plan-period">Tek Seferlik (Kurulum Dahil)</span>
            </div>
            <ul className="plan-features">
              <li className="plan-feature-item" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px', marginBottom: '8px' }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                <strong style={{ color: 'var(--green)' }}>1 Yıl Ücretsiz Yazılım Lisansı Dahil</strong>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>💻</span>
                <span><strong>Dokunmatik Bilgisayar:</strong> 11.6" Endüstriyel Panel PC</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>🖨️</span>
                <span><strong>Termal Fiş Yazıcı:</strong> 58mm Hızlı Termal Yazıcı</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>🔍</span>
                <span><strong>Barkod Okuyucu:</strong> El Tipi Lazer Okuyucu & Stant</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>💳</span>
                <span><strong>POS Bağlantısı:</strong> Banka EFT-POS Cihaz Entegrasyonu</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>💰</span>
                <span><strong>Para Çekmecesi:</strong> 5 Bölmeli Kilitli Para Çekmecesi</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>🛠️</span>
                <span><strong>Kurulum & Garanti:</strong> Uzaktan Kurulum & 2 Yıl Garanti</span>
              </li>
            </ul>
            <button className="btn-pricing" style={{ marginTop: 'auto' }} onClick={() => openOnboarding('ECO_SET')}>Seti Satın Al</button>
          </div>

          {/* Pro Hardware Set */}
          <div className="pricing-card">
            <div className="plan-name">Pro Tam Donanım Seti</div>
            <div className="plan-desc">Yoğun kasalı süpermarket ve cafeler için çift ekranlı profesyonel tam set.</div>
            <div className="plan-price-row">
              <span className="plan-price" style={{ fontSize: '28px' }}>{pricing.proSetPrice.toLocaleString('tr-TR')} TL</span>
              <span className="plan-period">Tek Seferlik (Yerinde Kurulum)</span>
            </div>
            <ul className="plan-features">
              <li className="plan-feature-item" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px', marginBottom: '8px' }}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                <strong style={{ color: 'var(--green)' }}>1 Yıl Ücretsiz Yazılım Lisansı Dahil</strong>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>💻</span>
                <span><strong>Dokunmatik Bilgisayar:</strong> 15.6" Çift Ekranlı Terminal PC</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>📠</span>
                <span><strong>Yazarkasa POS Cihazı:</strong> Yeni Nesil ÖKC Entegrasyonu</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>🖨️</span>
                <span><strong>Termal Fiş Yazıcı:</strong> 80mm Otomatik Giyotin Kesicili Yazıcı</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>🔍</span>
                <span><strong>Barkod Okuyucu:</strong> Masaüstü Çok Yönlü Karekod Okuyucu</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>💰</span>
                <span><strong>Para Çekmecesi:</strong> Büyük Boy Ağır Hizmet Çekmecesi</span>
              </li>
              <li className="plan-feature-item">
                <span style={{ fontSize: '14px', marginRight: '4px' }}>🛠️</span>
                <span><strong>Hizmet:</strong> Yerinde Kurulum + Eğitim + 2 Yıl Garanti</span>
              </li>
            </ul>
            <button className="btn-pricing" style={{ marginTop: 'auto' }} onClick={() => openOnboarding('PRO_SET')}>Seti Satın Al</button>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section id="faq" className="landing-faq">
        <div className="section-header" style={{ textAlign: 'center' }}>
          <h2 className="section-title">Sıkça Sorulan Sorular</h2>
          <p className="section-desc">MarketPOS hakkında aklınıza takılabilecek temel soruların cevapları.</p>
        </div>

        <div className="faq-list">
          <div className="faq-item">
            <button className={`faq-q ${openFaq === 0 ? 'open' : ''}`} onClick={() => toggleFaq(0)}>
              İnternet kesildiğinde program kapanır mı? Satış yapabilir miyiz?
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openFaq === 0 && (
              <div className="faq-a">
                Hayır, kapanmaz. MarketPOS tam çevrimdışı (offline) çalışabilecek mimaride tasarlanmıştır. Satışlarınız yerel SQLite veritabanına kaydedilir. İnternet geri geldiğinde, birikmiş veriler arka planda kayıpsız olarak bulut sunucularımızla otomatik senkronize edilir.
              </div>
            )}
          </div>

          <div className="faq-item">
            <button className={`faq-q ${openFaq === 1 ? 'open' : ''}`} onClick={() => toggleFaq(1)}>
              Lisans kodu nasıl çalışır, kaç bilgisayarda kullanılabilir?
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openFaq === 1 && (
              <div className="faq-a">
                Satın alma işlemi tamamlandıktan sonra size özel 16 haneli bir Lisans Kodu verilir. Bu kod, masaüstü uygulamasını ilk kez açtığınızda girilerek o bilgisayardaki kasayı aktif eder. Her lisans kodu tek bir aktif bilgisayar (kasa) için geçerlidir. Yeni bir kasa eklemek isterseniz, ek lisans almanız gerekmektedir.
              </div>
            )}
          </div>

          <div className="faq-item">
            <button className={`faq-q ${openFaq === 2 ? 'open' : ''}`} onClick={() => toggleFaq(2)}>
              Hangi fiş yazıcılarını veya barkod okuyucuları destekliyor?
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openFaq === 2 && (
              <div className="faq-a">
                MarketPOS, standart ESC/POS protokolünü destekleyen tüm 58mm ve 80mm termal fiş yazıcılarıyla uyumludur. USB veya Ethernet (Ağ) kablosu ile bağlanan yazıcılara doğrudan komut gönderebilir. Barkod okuyucular ise klavye gibi çalıştığı için marka bağımsız olarak tüm barkod okuyucular tak-çalıştır şeklinde doğrudan uyumludur.
              </div>
            )}
          </div>

          <div className="faq-item">
            <button className={`faq-q ${openFaq === 3 ? 'open' : ''}`} onClick={() => toggleFaq(3)}>
              Yedekleme sistemi bulutta mı yoksa bilgisayarda mı tutuluyor?
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openFaq === 3 && (
              <div className="faq-a">
                Her ikisinde de tutulur. İnternetiniz aktif olduğunda tüm verileriniz anında güvenli bulut sunucularımıza yedeklenir. Ayrıca, bilgisayarınızda da belirlediğiniz periyotlarla (örneğin saatlik) otomatik yerel yedek dosyaları (.db dosyaları) oluşturulur. Bu sayede verileriniz çift katmanlı koruma altındadır.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>&copy; 2026 MarketPOS Teknoloji A.Ş. Tüm hakları saklıdır.</p>
        <p style={{ marginTop: '8px', color: 'var(--fg-4)' }}>Fastify API + React Desktop Monorepo Application</p>
      </footer>

      {/* Onboarding Register & Checkout Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                MarketPOS Lisans Kaydı ({selectedPlan === 'ECO_SET' ? 'Eko Donanım Seti' : selectedPlan === 'PRO_SET' ? 'Pro Donanım Seti' : selectedPlan === 'YEARLY' ? 'Yıllık Yazılım Planı' : 'Aylık Yazılım Planı'})
              </span>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {errorText && (
                <div className="banner error modal-banner">
                  {errorText}
                </div>
              )}
              <form onSubmit={handleSubmit} className="form-grid">
                <label>
                  İşletme Adı (Şirket) *
                  <input
                    type="text"
                    name="companyName"
                    value={form.companyName}
                    onChange={handleInputChange}
                    placeholder="Örn: Özgüven Gıda Ltd. Şti."
                    required
                  />
                </label>

                <label>
                  Yönetici Adı Soyadı *
                  <input
                    type="text"
                    name="adminFullName"
                    value={form.adminFullName}
                    onChange={handleInputChange}
                    placeholder="Örn: Ahmet Yılmaz"
                    required
                  />
                </label>

                <label>
                  Yönetici E-Posta *
                  <input
                    type="email"
                    name="adminEmail"
                    value={form.adminEmail}
                    onChange={handleInputChange}
                    placeholder="Örn: ahmetyilmaz@gmail.com"
                    required
                  />
                  <span className="form-help">Ödeme bilgileri ve lisans kodunuz bu adrese gönderilecektir.</span>
                </label>

                <div className="inline-row">
                  <label>
                    Yönetici Kullanıcı Adı *
                    <input
                      type="text"
                      name="adminUsername"
                      value={form.adminUsername}
                      onChange={handleInputChange}
                      placeholder="admin"
                      required
                    />
                  </label>
                  <label>
                    Sektör Şablonu
                    <select
                      name="templateCode"
                      value={form.templateCode}
                      onChange={handleInputChange}
                    >
                      <option value="bakkal-v1">Bakkal/Market Preset</option>
                    </select>
                  </label>
                </div>

                <label>
                  Kasa Giriş Şifresi *
                  <input
                    type="password"
                    name="adminPassword"
                    value={form.adminPassword}
                    onChange={handleInputChange}
                    placeholder="••••••"
                    minLength={6}
                    required
                  />
                  <span className="form-help">En az 6 karakterli kasa giriş şifreniz.</span>
                </label>

                <div style={{ marginTop: '16px' }}>
                  <button type="submit" className="btn primary" style={{ width: '100%', height: '36px' }} disabled={loading}>
                    {loading ? 'Kayıt Yapılıyor...' : 'Kaydet ve Ödemeye Geç'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
