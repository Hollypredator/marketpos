import React, { useState } from 'react';

export interface ManagerApprovalPayload {
  managerFullName: string;
  managerUserId: string;
  method: 'PASSWORD' | 'PIN';
  reason: string;
}

interface ManagerApprovalModalProps {
  actionLabel: string;
  companyId?: string | null;
  description: string;
  onApproved: (payload: ManagerApprovalPayload) => Promise<void> | void;
  onCancel: () => void;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  requireReason?: boolean;
}

export default function ManagerApprovalModal({
  actionLabel,
  companyId,
  description,
  onApproved,
  onCancel,
  reasonLabel = 'Onay Notu',
  reasonPlaceholder = 'Kisa bir aciklama girin',
  requireReason = true,
}: ManagerApprovalModalProps): React.ReactElement {
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [username, setUsername] = useState('admin');

  const runApproval = async (method: 'PASSWORD' | 'PIN'): Promise<void> => {
    if (!window.electronAPI) {
      setError('Electron API bulunamadi.');
      return;
    }

    if (username.trim().length < 3) {
      setError('Yonetici kullanici adi gerekli.');
      return;
    }
    if (requireReason && reason.trim().length < 3) {
      setError('Bu islem icin en az 3 karakterlik onay notu gerekli.');
      return;
    }
    if (method === 'PIN' && !/^\d{4}$/u.test(pin.trim())) {
      setError('Yonetici PIN 4 haneli olmalidir.');
      return;
    }
    if (method === 'PASSWORD' && password.trim().length < 4) {
      setError('Yonetici sifresi gerekli.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const unlock = await window.electronAPI.verifyManagerUnlock({
        companyId: companyId ?? undefined,
        password: method === 'PASSWORD' ? password.trim() : undefined,
        pin: method === 'PIN' ? pin.trim() : undefined,
        username: username.trim(),
      });
      if (unlock.requiresPinSetup) {
        setError('Yonetici PIN tanimsiz. Once Ayarlar ekranindan PIN tanimlayin.');
        return;
      }

      await onApproved({
        managerFullName: unlock.user.fullName,
        managerUserId: unlock.user.id,
        method,
        reason: reason.trim(),
      });
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Yonetici onayi basarisiz.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-card" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h2>{actionLabel}</h2>
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={isSubmitting}>
            Kapat
          </button>
        </div>

        <p className="modal-caption">{description}</p>

        {error.length > 0 && <div className="login-error">{error}</div>}

        <div className="login-field">
          <label htmlFor="manager-username">Yonetici Kullanici Adi</label>
          <input
            id="manager-username"
            className="input"
            type="text"
            autoComplete="off"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div className="modal-grid-two">
          <div className="login-field">
            <label htmlFor="manager-pin">PIN (4 hane)</label>
            <input
              id="manager-pin"
              className="input"
              type="password"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
            <button
              className="btn btn-primary btn-block"
              type="button"
              disabled={isSubmitting}
              onClick={() => void runApproval('PIN')}
            >
              PIN ile Onayla
            </button>
          </div>

          <div className="login-field">
            <label htmlFor="manager-password">Yonetici Sifre</label>
            <input
              id="manager-password"
              className="input"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="btn btn-ghost btn-block"
              type="button"
              disabled={isSubmitting}
              onClick={() => void runApproval('PASSWORD')}
            >
              Sifre ile Onayla
            </button>
          </div>
        </div>

        <div className="login-field">
          <label htmlFor="manager-reason">{reasonLabel}</label>
          <input
            id="manager-reason"
            className="input"
            type="text"
            autoComplete="off"
            placeholder={reasonPlaceholder}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

