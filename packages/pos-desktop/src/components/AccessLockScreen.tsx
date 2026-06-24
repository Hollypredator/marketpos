import React, { useState } from 'react';

import type { CompanyAccessBlockDetails } from '../services/pos-runtime';
import { renewLicense } from '../services/pos-runtime';

interface AccessLockScreenProps {
  details: CompanyAccessBlockDetails;
  onSwitchToOnlineLogin: () => void;
}

function toDateText(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('tr-TR');
}

function getTitle(details: CompanyAccessBlockDetails): string {
  if (details.blockType === 'CLOCK_ROLLBACK') {
    return 'Guvenlik Kilidi';
  }
  if (details.blockType === 'OFFLINE_EXPIRED') {
    return 'Offline Dogrulama Suresi Doldu';
  }
  return 'Paket Erisimi Kapali';
}

export default function AccessLockScreen({
  details,
  onSwitchToOnlineLogin,
}: AccessLockScreenProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = licenseKey.trim();
    if (cleanKey.length < 5) {
      setErrorText('Lutfen gecerli bir lisans anahtari girin.');
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const snapshot = await renewLicense(cleanKey);
      if (window.electronAPI) {
        await window.electronAPI.setCompanyAccessSnapshot(snapshot);
      }
      alert('Lisans basariyla yenilendi! Uygulama yeniden baslatiliyor.');
      window.location.reload();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorText(err.message);
      } else {
        setErrorText('Lisans yenileme basarisiz oldu. Lutfen internet baglantinizi ve anahtari kontrol edin.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="access-lock-page">
      <div className="access-lock-card">
        <h1>{getTitle(details)}</h1>
        <p className="access-lock-message">{details.message}</p>

        <div className="access-lock-grid">
          <div>
            <strong>Durum</strong>
            <span>{details.snapshot?.status ?? '-'}</span>
          </div>
          <div>
            <strong>Son Kontrol</strong>
            <span>{toDateText(details.snapshot?.checkedAt ?? null)}</span>
          </div>
          <div>
            <strong>Offline Son Tarih</strong>
            <span>{toDateText(details.snapshot?.offlineAccessValidUntil ?? null)}</span>
          </div>
          <div>
            <strong>Cihaz Son Gorulme</strong>
            <span>{toDateText(details.snapshot?.localLastSeenAt ?? null)}</span>
          </div>
        </div>

        <ol className="access-lock-steps">
          <li>Cihazi internete baglayin.</li>
          <li>Online dogrulama ile tekrar giris yapin.</li>
          <li>Gerekirse merkez ekipten yeni bir lisans anahtari talep edin.</li>
        </ol>

        <div className="access-lock-renew-section">
          <h3>Yeni Lisans Kodu ile Yenile</h3>
          <p className="muted">
            Merkez ekipten aldiginiz yeni 365 gunluk lisans anahtarini girerek paketinizi aninda uzatabilirsiniz.
          </p>
          <form onSubmit={handleRenew} className="renew-form">
            <input
              type="text"
              className="input"
              placeholder="Orn: MP-XXXX-XXXX-XXXX-XXXX"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              disabled={loading}
              style={{
                textTransform: 'uppercase',
                width: '100%',
                padding: '12px',
                fontSize: '1.1rem',
                letterSpacing: '1px',
                textAlign: 'center',
                margin: '10px 0 5px 0',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text)'
              }}
            />
            {errorText && (
              <div style={{ color: 'var(--danger)', fontSize: '0.9rem', margin: '5px 0' }}>
                {errorText}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading || licenseKey.trim().length === 0}
              style={{ width: '100%', marginTop: '5px', padding: '12px' }}
            >
              {loading ? 'Lisans Dogrulaniyor...' : 'Lisansi Etkinlestir'}
            </button>
          </form>
        </div>

        <div style={{ marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
          <button className="btn btn-ghost" type="button" onClick={onSwitchToOnlineLogin} style={{ width: '100%' }}>
            Giris Ekranina Don
          </button>
        </div>
      </div>
    </div>
  );
}

