import React, { useMemo, useState } from 'react';

import type { PurchaseInvoiceForm, PurchaseInvoiceItemForm } from '../../domain/invoices/api';
import type { Supplier } from '../../domain/suppliers/api';
import { toLocalDateIso } from '../../lib/format';

interface PurchaseInvoiceFormPageProps {
  onCancel: () => void;
  onSave: (form: PurchaseInvoiceForm) => Promise<void>;
  products: any[];
  saving: boolean;
  suppliers: Supplier[];
  toMoney: (value: number) => string;
}

export function PurchaseInvoiceFormPage({
  onCancel,
  onSave,
  products,
  saving,
  suppliers,
  toMoney,
}: PurchaseInvoiceFormPageProps): React.ReactElement {
  const [errorText, setErrorText] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [form, setForm] = useState<PurchaseInvoiceForm>({
    documentType: 'INVOICE',
    dispatchNo: '',
    dueDate: toLocalDateIso(new Date()),
    invoiceDate: toLocalDateIso(new Date()),
    invoiceNo: '',
    items: [],
    note: '',
    supplierId: '',
    taxTotal: 0,
  });

  const filteredProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
            product.barcode.includes(productSearch),
        )
        .slice(0, 10),
    [productSearch, products],
  );

  const handleAddItem = (product: any): void => {
    setForm((current) => {
      const existingItem = current.items.find((item) => item.productId === product.id);
      if (existingItem) {
        return {
          ...current,
          items: current.items.map((item) =>
            item.productId === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          ),
        };
      }

      return {
        ...current,
        items: [
          ...current.items,
          {
            productId: product.id,
            quantity: 1,
            unitPrice: product.purchasePrice || 0,
          },
        ],
      };
    });
    setProductSearch('');
  };

  const handleUpdateItem = (index: number, field: keyof PurchaseInvoiceItemForm, value: number): void => {
    setForm((current) => {
      const nextItems = [...current.items];
      nextItems[index] = { ...nextItems[index], [field]: value };
      return { ...current, items: nextItems };
    });
  };

  const handleRemoveItem = (index: number): void => {
    setForm((current) => {
      const nextItems = [...current.items];
      nextItems.splice(index, 1);
      return { ...current, items: nextItems };
    });
  };

  const calculateSubTotal = (): number =>
    form.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (form.items.length === 0) {
      setErrorText('Lütfen en az bir ürün ekleyin.');
      return;
    }
    if (form.supplierId.trim().length === 0) {
      setErrorText('Lütfen bir tedarikçi seçin.');
      return;
    }
    if (form.documentType === 'DISPATCH' && (form.dispatchNo ?? '').trim().length === 0) {
      setErrorText('İrsaliye tipinde irsaliye numarası zorunludur.');
      return;
    }
    if (
      (form.documentType === 'DISPATCH' || form.documentType === 'INVOICE') &&
      (!form.invoiceDate || form.invoiceDate.trim().length === 0)
    ) {
      setErrorText('Belge tarihi zorunludur.');
      return;
    }
    if (form.documentType === 'INVOICE' && (!form.dueDate || form.dueDate.trim().length === 0)) {
      setErrorText('Fatura tipinde vade tarihi zorunludur.');
      return;
    }
    if (form.invoiceDate && form.dueDate && form.dueDate < form.invoiceDate) {
      setErrorText('Vade tarihi belge tarihinden önce olamaz.');
      return;
    }
    setErrorText(null);
    void onSave(form);
  };

  return (
    <section className="panel-grid">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button className="btn" onClick={onCancel} type="button">
          ← Geri
        </button>
        <h2>Yeni Alış Faturası</h2>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        {errorText && <div className="banner error">{errorText}</div>}

        <article className="card">
          <h3 style={{ marginBottom: '14px' }}>Fatura Detayları</h3>
          <div className="inline-row three">
            <label>
              Belge Tipi *
              <select
                onChange={(event) =>
                  setForm({
                    ...form,
                    documentType: event.target.value as PurchaseInvoiceForm['documentType'],
                  })
                }
                value={form.documentType}
              >
                <option value="INVOICE">Alış Faturası</option>
                <option value="DISPATCH">İrsaliye</option>
                <option value="ORDER">Sipariş</option>
              </select>
            </label>
            <label>
              Tedarikçi *
              <select
                onChange={(event) => setForm({ ...form, supplierId: event.target.value })}
                required
                value={form.supplierId}
              >
                <option value="">Seçiniz...</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {form.documentType === 'ORDER' ? 'Sipariş No' : 'Fatura No'}
              <input
                onChange={(event) => setForm({ ...form, invoiceNo: event.target.value })}
                type="text"
                value={form.invoiceNo}
              />
            </label>
          </div>

          <div className="inline-row three" style={{ marginTop: '10px' }}>
            <label>
              Belge Tarihi
              <input
                onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })}
                type="date"
                value={(form.invoiceDate || '').slice(0, 10)}
              />
            </label>
            <label>
              Vade Tarihi
              <input
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                required={form.documentType === 'INVOICE'}
                type="date"
                value={(form.dueDate || '').slice(0, 10)}
              />
            </label>
            {form.documentType === 'DISPATCH' ? (
              <label>
                İrsaliye No
                <input
                  onChange={(event) => setForm({ ...form, dispatchNo: event.target.value })}
                  type="text"
                  value={form.dispatchNo || ''}
                />
              </label>
            ) : (
              <div />
            )}
          </div>
        </article>

        <article className="card">
          <h3 style={{ marginBottom: '10px' }}>Fatura Kalemleri</h3>
          <div className="form-grid compact" style={{ position: 'relative', marginBottom: '14px' }}>
            <label>
              Ürün Ekle
              <input
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Ürün adı veya barkod girin..."
                type="text"
                value={productSearch}
              />
            </label>
            {productSearch.length > 0 && (
              <ul className="list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                {filteredProducts.map((product) => (
                  <li key={product.id} style={{ border: 'none', borderRadius: 0, borderBottom: '1px solid var(--border-s)' }}>
                    <button
                      className="btn ghost"
                      style={{ width: '100%', justifyContent: 'space-between', display: 'flex', color: 'var(--fg-2)' }}
                      onClick={() => handleAddItem(product)}
                      type="button"
                    >
                      <span>
                        {product.name} <span className="muted">({product.barcode})</span>
                      </span>
                      <span>Stok: {product.quantity || 0}</span>
                    </button>
                  </li>
                ))}
                {filteredProducts.length === 0 && (
                  <li style={{ padding: '10px', color: 'var(--fg-4)', textAlign: 'center' }}>Ürün bulunamadı.</li>
                )}
              </ul>
            )}
          </div>

          {form.items.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th style={{ width: '120px' }}>Adet</th>
                    <th style={{ width: '150px' }}>Birim Fiyat</th>
                    <th style={{ width: '150px', textAlign: 'right' }}>Toplam</th>
                    <th style={{ width: '50px' }} />
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, index) => {
                    const product = products.find((candidate) => candidate.id === item.productId);
                    return (
                      <tr key={item.productId}>
                        <td style={{ fontWeight: 500, color: 'var(--fg-1)' }}>{product?.name || item.productId}</td>
                        <td>
                          <input
                            min="0.01"
                            onChange={(event) => handleUpdateItem(index, 'quantity', Number.parseFloat(event.target.value) || 0)}
                            step="any"
                            type="number"
                            value={item.quantity}
                          />
                        </td>
                        <td>
                          <input
                            min="0"
                            onChange={(event) => handleUpdateItem(index, 'unitPrice', Number.parseFloat(event.target.value) || 0)}
                            step="any"
                            type="number"
                            value={item.unitPrice}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--accent-v)' }}>{toMoney(item.quantity * item.unitPrice)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn ghost"
                            style={{ color: 'var(--red)' }}
                            onClick={() => handleRemoveItem(index)}
                            title="Kaldır"
                            type="button"
                          >
                            Kaldır
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-state-title">Kalem eklenmedi</span>
              <span className="empty-state-sub">Faturaya dahil etmek için yukarıdaki arama alanından ürün ekleyin.</span>
            </div>
          )}
        </article>

        <article className="card">
          <div className="inline-row two">
            <label>
              Notlar
              <textarea
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                rows={3}
                value={form.note}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', width: '260px', justifyContent: 'space-between', color: 'var(--fg-3)' }}>
                <span>Ara Toplam:</span>
                <span style={{ color: 'var(--fg-1)' }}>{toMoney(calculateSubTotal())}</span>
              </div>
              <div style={{ display: 'flex', width: '260px', alignItems: 'center', justifyContent: 'space-between', color: 'var(--fg-3)' }}>
                <span>Toplam KDV:</span>
                <input
                  style={{ width: '100px', textAlign: 'right' }}
                  onChange={(event) => setForm({ ...form, taxTotal: Number.parseFloat(event.target.value) || 0 })}
                  placeholder="KDV"
                  step="any"
                  type="number"
                  value={form.taxTotal}
                />
              </div>
              <div className="divider" style={{ width: '260px', margin: '4px 0' }} />
              <div style={{ display: 'flex', width: '260px', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-h)' }}>
                <span>Genel Toplam:</span>
                <span>{toMoney(calculateSubTotal() + form.taxTotal)}</span>
              </div>
            </div>
          </div>
        </article>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
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
            {saving ? 'Kaydediliyor...' : 'Belgeyi Kaydet'}
          </button>
        </div>
      </form>
    </section>
  );
}
