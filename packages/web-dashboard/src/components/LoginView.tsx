import React from 'react';
import type { LoginMode } from '../domain/auth/types';

interface LoginViewProps {
  accessBlockedMessage: string | null;
  banner: { text: string; type: 'error' | 'success' } | null;
  login: {
    email: string;
    mode: LoginMode;
    companyId: string;
    password: string;
    username: string;
  };
  onChangeEmail: (value: string) => void;
  onChangeCompanyId: (value: string) => void;
  onChangeMode: (mode: LoginMode) => void;
  onChangePassword: (value: string) => void;
  onChangeUsername: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
}

export function LoginView({
  accessBlockedMessage,
  banner,
  login,
  onChangeEmail,
  onChangeCompanyId,
  onChangeMode,
  onChangePassword,
  onChangeUsername,
  onSubmit,
  saving,
}: LoginViewProps): React.ReactElement {
  const emailMode = login.mode === 'EMAIL';

  return (
    <main className="admin-shell login-mode">
      <section className="card login-card">
        <h1>MarketPOS SaaS Backoffice</h1>
        <p className="muted">Platform yonetimi, tenant operasyonlari ve abonelik akislarini bu panelden yonetin.</p>
        {accessBlockedMessage && <div className="banner error">{accessBlockedMessage}</div>}
        {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}
        <div className="segmented-control" role="tablist" aria-label="Giris modu">
          <button
            type="button"
            className={`segment ${emailMode ? 'active' : ''}`}
            onClick={() => onChangeMode('EMAIL')}
          >
            Email ile Giris
          </button>
          <button
            type="button"
            className={`segment ${!emailMode ? 'active' : ''}`}
            onClick={() => onChangeMode('LEGACY')}
          >
            Legacy Giris
          </button>
        </div>
        <form className="form-grid" onSubmit={onSubmit}>
          {emailMode ? (
            <label>
              Email
              <input
                autoComplete="username"
                type="email"
                value={login.email}
                onChange={(event) => onChangeEmail(event.target.value)}
                required
              />
            </label>
          ) : (
            <>
              <label>
                Kullanici adi
                <input
                  autoComplete="username"
                  value={login.username}
                  onChange={(event) => onChangeUsername(event.target.value)}
                  required
                />
              </label>
              <label>
                Firma ID (opsiyonel, SUPER_ADMIN icin)
                <input
                  value={login.companyId}
                  onChange={(event) => onChangeCompanyId(event.target.value)}
                  placeholder="uuid"
                />
              </label>
            </>
          )}
          <label>
            Sifre
            <input
              type="password"
              autoComplete="current-password"
              value={login.password}
              onChange={(event) => onChangePassword(event.target.value)}
              required
            />
          </label>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Giris yapiliyor...' : 'Giris Yap'}
          </button>
          <p className="muted">5 hatali denemeden sonra gecici login kilidi devreye girer.</p>
        </form>
      </section>
    </main>
  );
}
