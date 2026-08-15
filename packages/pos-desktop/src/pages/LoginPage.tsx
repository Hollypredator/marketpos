import React, { type FormEvent, useEffect, useRef, useState } from 'react';

import {
  explainRuntimeError,
  loginOffline,
  loginOnline,
  getLocalSetting,
} from '../services/pos-runtime';
import type { AuthSession } from '../services/types';
import { useToast } from '../store';

interface LoginPageProps {
  onLoginSuccess: (session: AuthSession) => Promise<void>;
}

type LoginMode = 'AUTO' | 'OFFLINE_ONLY';

function shouldTryOfflineFallback(error: unknown): boolean {
  const message = explainRuntimeError(error).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('connect')
  );
}

function mapLoginError(error: unknown): string {
  const message = explainRuntimeError(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('aborted') || normalized.includes('signal') || normalized.includes('timeout')) {
    return 'Sunucu baglantisi zamanasimi (Render API uyaniyor olabilir). Lutfen tekrar deneyin.';
  }
  if (normalized.includes('kullanici adi veya sifre hatali')) {
    return 'Kullanici adi veya sifre hatali. Bilgileri kontrol edip tekrar deneyin.';
  }
  if (normalized.includes('online baglanti kurulamadi')) {
    return 'Online baglanti kurulamadi. Bu cihazda daha once online giris yapilmissa offline modu deneyin.';
  }
  if (normalized.includes('offline login icin bu cihazda dogrulanmis kullanici bulunamadi')) {
    return 'Offline cache bulunamadi. Once API acikken online giris yapmaniz gerekir.';
  }
  if (normalized.includes('paket') || normalized.includes('yenileme') || normalized.includes('erisim kapatildi')) {
    return message;
  }
  return message;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const toast = useToast();
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [companyId, setCompanyId] = useState('');
  const [mode, setMode] = useState<LoginMode>('AUTO');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  const isFormReady = username.trim().length >= 3 && password.length >= 4;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.electronAPI) {
        void window.electronAPI.ensureInteractive();
      }
      usernameInputRef.current?.focus();
      const root = document.getElementById('root');
      if (root) {
        root.style.pointerEvents = 'auto';
      }
      document.documentElement.style.pointerEvents = 'auto';
      document.body.style.pointerEvents = 'auto';
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    void getLocalSetting('auth_company_id', '').then((cachedCompanyId) => {
      if (cachedCompanyId && cachedCompanyId.trim().length > 0) {
        setCompanyId(cachedCompanyId);
        setStep(2);
      }
    });
  }, []);

  const submitLogin = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!isFormReady) {
      return;
    }

    setError('');
    setIsLoading(true);

    const payload = {
      companyId: companyId.trim() || undefined,
      password,
      username: username.trim(),
    };

    let usedOfflineFallback = false;
    try {
      let session: AuthSession;
      if (mode === 'OFFLINE_ONLY') {
        session = await loginOffline(payload);
      } else {
        try {
          session = await loginOnline(payload);
        } catch (onlineError: unknown) {
          if (!shouldTryOfflineFallback(onlineError)) {
            throw onlineError;
          }
          usedOfflineFallback = true;
          try {
            session = await loginOffline(payload);
          } catch {
            throw new Error(
              'Online baglanti kurulamadi ve bu cihazda offline giris icin cache bulunamadi.',
            );
          }
        }
      }

      await onLoginSuccess(session);
      if (usedOfflineFallback || !session.isOnline) {
        toast.info(`Offline giris yapildi. Hos geldiniz ${session.user.fullName}.`);
      } else {
        toast.success(`Hos geldiniz ${session.user.fullName}.`);
      }
    } catch (caughtError: unknown) {
      const message = mapLoginError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" style={{ maxWidth: '520px' }} onSubmit={submitLogin}>
        <div className="login-logo">M</div>
        
        {/* Wizard Step Progress Header */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '0.8rem',
            fontWeight: 700,
            background: step === 1 ? 'var(--primary, #4f46e5)' : 'rgba(255,255,255,0.08)',
            color: step === 1 ? '#fff' : 'var(--text-muted)'
          }}>
            1. Lisans Kodu
          </div>
          <div style={{ padding: '6px 4px', color: 'var(--text-muted)' }}>➔</div>
          <div style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '0.8rem',
            fontWeight: 700,
            background: step === 2 ? 'var(--primary, #4f46e5)' : 'rgba(255,255,255,0.08)',
            color: step === 2 ? '#fff' : 'var(--text-muted)'
          }}>
            2. Kullanıcı Girişi
          </div>
          <div style={{ padding: '6px 4px', color: 'var(--text-muted)' }}>➔</div>
          <div style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '0.8rem',
            fontWeight: 700,
            background: step === 3 ? 'var(--primary, #4f46e5)' : 'rgba(255,255,255,0.08)',
            color: step === 3 ? '#fff' : 'var(--text-muted)'
          }}>
            3. Kurulum Tamamlandı
          </div>
        </div>

        <div className="login-head">
          <p className="login-kicker">Masaüstü Kasa Kurulum Sihirbazı</p>
          <h1 className="login-title">
            {step === 1 ? 'Lisans Kodu Girişi' : step === 2 ? 'Yetkili Girişi' : 'Kurulum Hazır!'}
          </h1>
          <p className="login-subtitle">
            {step === 1
              ? 'Web panelinizden aldığınız Lisans Kodunu (Örn: MPOS-XXXX-XXXX) girin.'
              : step === 2
              ? 'Kasayı açmak ve senkronize etmek için kullanıcı bilgilerinizi girin.'
              : 'Donanım ve yazıcı bağlantılarınız hazır. Kasayı başlatabilirsiniz.'}
          </p>
        </div>

        {error.length > 0 && <div className="login-error">{error}</div>}

        {/* STEP 1: LİSANS KODU */}
        {step === 1 && (
          <div className="login-field">
            <label htmlFor="company-id">Lisans Kodu / Firma ID (Zorunlu)</label>
            <input
              id="company-id"
              className="input"
              type="text"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              placeholder="Örn: MPOS-XXXX-XXXX veya Firma ID"
              autoComplete="off"
              autoFocus
            />
            <div style={{ marginTop: '14px' }}>
              <button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                onClick={() => {
                  if (companyId.trim().length === 0) {
                    setError('Lütfen Web Panelinizden aldığınız Lisans Kodunu girin.');
                    return;
                  }
                  setError('');
                  setStep(2);
                }}
              >
                Lisansı Doğrula & İlerle ➔
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: KULLANICI GİRİŞİ */}
        {step === 2 && (
          <>
            <div className="login-field">
              <label htmlFor="username">Kullanıcı Adı</label>
              <input
                ref={usernameInputRef}
                id="username"
                className="input"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Kullanıcı adınızı girin"
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">Şifre</label>
              <input
                id="password"
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Şifrenizi girin"
                autoComplete="off"
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStep(1)}
              >
                ⬅ Geri
              </button>
              <button
                className="btn btn-primary btn-lg btn-block login-submit"
                type="submit"
                disabled={isLoading || !isFormReady}
              >
                {isLoading
                  ? 'Doğrulanıyor...'
                  : mode === 'OFFLINE_ONLY'
                    ? 'Offline Kasayı Aç'
                    : 'Giriş Yap ve Kasayı Başlat 🚀'}
              </button>
            </div>
          </>
        )}

        {/* STEP 3: TAMAMLAMA & BİLGİ */}
        {step === 3 && (
          <div style={{ textAlign: 'center', display: 'grid', gap: '16px' }}>
            <div style={{ fontSize: '3rem' }}>🎉</div>
            <h3>Kurulum Başarıyla Tamamlandı!</h3>
            <p className="muted">Kasaya giriş yapıp ürün satışına başlayabilirsiniz.</p>
            <button
              type="submit"
              className="btn btn-primary btn-lg btn-block"
              disabled={isLoading}
            >
              Kasayı Başlat 🚀
            </button>
          </div>
        )}

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            className="btn btn-ghost"
            type="button"
            style={{ fontSize: '0.8rem' }}
            disabled={isLoading}
            onClick={() => setMode((current) => (current === 'AUTO' ? 'OFFLINE_ONLY' : 'AUTO'))}
          >
            {mode === 'AUTO' ? 'Sadece Offline Moduna Geç' : 'Online Moduna Dön'}
          </button>
        </div>

        {!window.electronAPI && (
          <div style={{
            marginTop: '20px',
            padding: '16px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.12) 0%, rgba(99, 102, 241, 0.22) 100%)',
            border: '1.5px solid rgba(79, 70, 229, 0.35)',
            textAlign: 'center',
            display: 'grid',
            gap: '10px'
          }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              💻 MarketPOS Masaüstü Kasa Uygulaması (.exe)
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Yazarkasa, termal yazıcı ve barkod okuyucu destekli çevrimdışı masaüstü uygulamasını kurmak için indirin.
            </p>
            <a
              href="/api/license/download-desktop"
              download="MarketPOS-Setup.exe"
              className="btn btn-primary btn-block"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Masaüstü .exe Dosyasını İndir
            </a>
          </div>
        )}

        <p className="login-help">
          Offline giris yalnizca bu cihazda daha once online dogrulanan kullanicilar icin aciktir.
        </p>
      </form>
    </div>
  );
}
