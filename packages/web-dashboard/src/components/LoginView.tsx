import React from 'react';

interface LoginViewProps {
  accessBlockedMessage: string | null;
  banner: { text: string; type: 'error' | 'success' } | null;
  login: {
    companyId: string;
    password: string;
    username: string;
  };
  onChangeCompanyId: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeUsername: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
}

export function LoginView({
  accessBlockedMessage,
  banner,
  login,
  onChangeCompanyId,
  onChangePassword,
  onChangeUsername,
  onSubmit,
  saving,
}: LoginViewProps): React.ReactElement {
  return (
    <main className="admin-shell login-mode">
      <section className="card login-card">
        <h1>MarketPOS SaaS Backoffice</h1>
        <p className="muted">Platform yonetimi, tenant operasyonlari ve abonelik akislarini bu panelden yonetin.</p>
        {accessBlockedMessage && <div className="banner error">{accessBlockedMessage}</div>}
        {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}
        <form className="form-grid" onSubmit={onSubmit}>
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
            Sifre
            <input
              type="password"
              autoComplete="current-password"
              value={login.password}
              onChange={(event) => onChangePassword(event.target.value)}
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
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Giris yapiliyor...' : 'Giris Yap'}
          </button>
          <p className="muted">5 hatali denemeden sonra gecici login kilidi devreye girer.</p>
        </form>
      </section>
    </main>
  );
}
