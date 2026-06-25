import React, { useEffect, useState } from 'react';
import type { SupplierForm } from '../../domain/suppliers/api';

interface SupplierFormPageProps {
  initialData?: SupplierForm | null;
  onCancel: () => void;
  onSave: (form: SupplierForm) => Promise<void>;
  saving: boolean;
}

export function SupplierFormPage({
  initialData,
  onCancel,
  onSave,
  saving,
}: SupplierFormPageProps): React.ReactElement {
  const [form, setForm] = useState<SupplierForm>({
    address: '',
    email: '',
    name: '',
    phone: '',
    taxNumber: '',
  });

  useEffect(() => {
    if (initialData) {
      setForm(initialData);
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSave(form);
  };

  return (
    <section className="panel-grid">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          className="btn"
          onClick={onCancel}
          type="button"
        >
          ← Geri
        </button>
        <h2>{initialData ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi Ekle'}</h2>
      </div>

      <article className="card" style={{ maxWidth: '600px' }}>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Tedarikçi Adı / Firma Ünvanı *
            <input
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              type="text"
              value={form.name}
            />
          </label>

          <div className="inline-row two">
            <label>
              Vergi No / T.C. No
              <input
                onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
                type="text"
                value={form.taxNumber}
              />
            </label>
            <label>
              Telefon
              <input
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                type="text"
                value={form.phone}
              />
            </label>
          </div>

          <label>
            E-Posta
            <input
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              type="email"
              value={form.email}
            />
          </label>

          <label>
            Adres
            <textarea
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={3}
              value={form.address}
            />
          </label>

          <div className="divider" />

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              className="btn"
              onClick={onCancel}
              type="button"
            >
              İptal
            </button>
            <button
              className="btn primary"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
