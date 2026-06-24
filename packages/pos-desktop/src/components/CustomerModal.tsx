import React, { useState } from 'react';
import type { CustomerRecord } from '../services/types';

interface CustomerModalProps {
  customer?: CustomerRecord | null;
  onClose: () => void;
  onSave: (data: Partial<CustomerRecord>) => Promise<void>;
}

export default function CustomerModal({
  customer,
  onClose,
  onSave,
}: CustomerModalProps): React.ReactElement {
  const [fullName, setFullName] = useState(customer?.fullName || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [taxNumber, setTaxNumber] = useState(customer?.taxNumber || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [priceTier, setPriceTier] = useState<'RETAIL' | 'WHOLESALE'>(customer?.priceTier || 'RETAIL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Müşteri adı zorunludur.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onSave({
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        taxNumber: taxNumber.trim() || undefined,
        address: address.trim() || undefined,
        priceTier,
      });
      onClose();
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : 'Kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-card" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>{customer ? 'Müşteri Düzenle' : 'Yeni Müşteri Ekle'}</h2>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={isSubmitting}>
            Kapat
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="login-error" style={{ marginBottom: '1.5rem' }}>{error}</div>}

          <div className="login-field">
            <label>Müşteri Ad Soyad / Ünvan *</label>
            <input
              className="input"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Örn: Ahmet Yılmaz veya ABC Ltd. Şti."
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="login-field">
              <label>Telefon</label>
              <input
                className="input"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xx..."
              />
            </div>
            <div className="login-field">
              <label>E-posta</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="örnek@mail.com"
              />
            </div>
          </div>

          <div className="login-field">
            <label>TC Kimlik / Vergi Numarası</label>
            <input
              className="input"
              type="text"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              placeholder="10 veya 11 haneli"
            />
          </div>

          <div className="login-field">
            <label>Adres</label>
            <textarea
              className="input"
              style={{ height: '80px', paddingTop: '0.5rem', resize: 'none' }}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Açık adres bilgisi..."
            />
          </div>

          <div className="login-field">
            <label>Müşteri Tipi (Fiyat Kademesi)</label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className={`btn ${priceTier === 'RETAIL' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setPriceTier('RETAIL')}
              >
                Standart (Perakende)
              </button>
              <button
                type="button"
                className={`btn ${priceTier === 'WHOLESALE' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1 }}
                onClick={() => setPriceTier('WHOLESALE')}
              >
                Toptan (B2B)
              </button>
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Müşteriyi Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
