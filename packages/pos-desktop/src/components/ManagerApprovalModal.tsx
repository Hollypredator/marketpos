import React, { useState } from 'react';
import { readIntegrationSettings } from '../services/integration-settings';

export interface ManagerApprovalPayload {
  managerFullName: string;
  managerUserId: string;
  method: 'PASSWORD' | 'SMS';
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
  const [smsCode, setSmsCode] = useState('');
  const [reason, setReason] = useState('');
  const [username, setUsername] = useState('admin');
  const [step, setStep] = useState<'CREDENTIALS' | 'SMS_CODE'>('CREDENTIALS');
  const [integrations] = useState(() => readIntegrationSettings());
  const [smsMessage, setSmsMessage] = useState('');

  const sendSmsCode = async (): Promise<void> => {
    if (!window.electronAPI) return;
    if (username.trim().length < 3) {
      setError('Yonetici kullanici adi gerekli.');
      return;
    }
    
    setError('');
    setIsSubmitting(true);
    try {
      const result = await window.electronAPI.requestManagerSmsCode({ username: username.trim() });
      if (result.success) {
        setSmsMessage(result.message);
        setStep('SMS_CODE');
      }
    } catch (err: any) {
      setError(err.message || 'SMS gonderimi basarisiz.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifySmsAndApprove = async (): Promise<void> => {
    if (!window.electronAPI) return;
    if (smsCode.length !== 6) {
      setError('Lutfen 6 haneli kodu girin.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const unlock = await window.electronAPI.verifyManagerSmsCode({
        code: smsCode,
        username: username.trim()
      });

      await onApproved({
        managerFullName: unlock.user.fullName,
        managerUserId: unlock.user.id,
        method: 'SMS',
        reason: reason.trim(),
      });
    } catch (err: any) {
      setError(err.message || 'Kod dogrulama basarisiz.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const runApproval = async (): Promise<void> => {
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
    if (password.trim().length < 4) {
      setError('Yonetici sifresi gerekli.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const unlock = await window.electronAPI.verifyManagerUnlock({
        companyId: companyId ?? undefined,
        password: password.trim(),
        username: username.trim(),
      });

      await onApproved({
        managerFullName: unlock.user.fullName,
        managerUserId: unlock.user.id,
        method: 'PASSWORD',
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
      <div className="modal-card" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2>{actionLabel}</h2>
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={isSubmitting}>
            Kapat
          </button>
        </div>

        <p className="modal-caption" style={{ marginBottom: '1rem' }}>{description}</p>

        {error.length > 0 && <div className="login-error" style={{ marginBottom: '1rem', color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</div>}

        {step === 'CREDENTIALS' ? (
          <div className="approval-fields" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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

            <div className="login-field">
              <label htmlFor="manager-password">Sifre ile Onayla</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="manager-password"
                  className="input"
                  type="password"
                  style={{ flex: 1 }}
                  placeholder="Sifre..."
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void runApproval()}
                >
                  Onayla
                </button>
              </div>
            </div>

            {integrations.isManagerSMSEnabled && (
              <div style={{ textAlign: 'center', padding: '10px 0', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <button 
                  className="btn btn-ghost" 
                  style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600 }}
                  onClick={() => void sendSmsCode()}
                  disabled={isSubmitting}
                >
                  SMS Kodu ile Onayla
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="sms-fields" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
            <div className="sms-info" style={{ background: 'var(--info-light)', padding: '10px', borderRadius: '8px', fontSize: '0.85rem' }}>
              {smsMessage}
            </div>
            
            <div className="login-field">
              <label htmlFor="sms-code">6 Haneli Onay Kodu</label>
              <input
                id="sms-code"
                className="input"
                type="text"
                maxLength={6}
                style={{ fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.5em', fontWeight: 800 }}
                value={smsCode}
                onChange={(event) => setSmsCode(event.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>

            <button
               className="btn btn-primary btn-block"
               onClick={() => void verifySmsAndApprove()}
               disabled={isSubmitting || smsCode.length !== 6}
            >
              Kod Doğrula ve İşlemi Yap
            </button>

            <button 
               className="btn btn-link" 
               style={{ fontSize: '0.8rem' }}
               onClick={() => setStep('CREDENTIALS')}
               disabled={isSubmitting}
            >
              Şifre ekranına geri dön
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
