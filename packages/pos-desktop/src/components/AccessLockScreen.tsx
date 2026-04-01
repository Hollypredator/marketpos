import React from 'react';

import type { CompanyAccessBlockDetails } from '../services/pos-runtime';

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
          <li>Gerekirse merkez ekipten paket durumunu kontrol ettirin.</li>
        </ol>

        <button className="btn btn-primary btn-lg" type="button" onClick={onSwitchToOnlineLogin}>
          Online Giris Ekranina Don
        </button>
      </div>
    </div>
  );
}

