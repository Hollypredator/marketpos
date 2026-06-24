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
    <div className="flex h-full flex-col bg-gray-900">
      <div className="flex items-center border-b border-gray-800 px-6 py-4">
        <button
          className="mr-4 text-gray-400 hover:text-white"
          onClick={onCancel}
          type="button"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 className="text-xl font-semibold text-white">
            {initialData ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi Ekle'}
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form className="mx-auto max-w-2xl space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Tedarikçi Adı / Firma Ünvanı *</label>
              <input
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                type="text"
                value={form.name}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Vergi No / T.C. No</label>
                <input
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                  onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
                  type="text"
                  value={form.taxNumber}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Telefon</label>
                <input
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  type="text"
                  value={form.phone}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">E-Posta</label>
              <input
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                type="email"
                value={form.email}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Adres</label>
              <textarea
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={3}
                value={form.address}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-800 pt-6">
            <button
              className="rounded border border-gray-700 bg-transparent px-4 py-2 font-medium text-gray-300 hover:bg-gray-800"
              onClick={onCancel}
              type="button"
            >
              İptal
            </button>
            <button
              className="rounded bg-teal-600 px-6 py-2 font-medium text-white hover:bg-teal-500 disabled:opacity-50"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
