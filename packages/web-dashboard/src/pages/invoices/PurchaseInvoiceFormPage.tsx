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
      setErrorText('Lutfen en az bir urun ekleyin.');
      return;
    }
    if (form.supplierId.trim().length === 0) {
      setErrorText('Lutfen bir tedarikci secin.');
      return;
    }
    if (form.documentType === 'DISPATCH' && (form.dispatchNo ?? '').trim().length === 0) {
      setErrorText('Irsaliye tipinde irsaliye numarasi zorunludur.');
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
      setErrorText('Vade tarihi belge tarihinden once olamaz.');
      return;
    }
    setErrorText(null);
    void onSave(form);
  };

  return (
    <div className="flex h-full flex-col bg-gray-900">
      <div className="flex items-center border-b border-gray-800 px-6 py-4">
        <button className="mr-4 text-gray-400 hover:text-white" onClick={onCancel} type="button">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          </svg>
        </button>
        <div>
          <h2 className="text-xl font-semibold text-white">Yeni Alis Faturasi</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form className="mx-auto max-w-5xl space-y-6" onSubmit={handleSubmit}>
          {errorText && <div className="banner error">{errorText}</div>}

          <div className="grid grid-cols-3 gap-6 rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Belge Tipi *</label>
              <select
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
                onChange={(event) =>
                  setForm({
                    ...form,
                    documentType: event.target.value as PurchaseInvoiceForm['documentType'],
                  })
                }
                value={form.documentType}
              >
                <option value="INVOICE">Alis Faturasi</option>
                <option value="DISPATCH">Irsaliye</option>
                <option value="ORDER">Siparis</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Tedarikci *</label>
              <select
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
                onChange={(event) => setForm({ ...form, supplierId: event.target.value })}
                required
                value={form.supplierId}
              >
                <option value="">Seciniz...</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                {form.documentType === 'ORDER' ? 'Siparis No' : 'Fatura No'}
              </label>
              <input
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                onChange={(event) => setForm({ ...form, invoiceNo: event.target.value })}
                type="text"
                value={form.invoiceNo}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Belge Tarihi</label>
              <input
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
                onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })}
                type="date"
                value={(form.invoiceDate || '').slice(0, 10)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Vade Tarihi</label>
              <input
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                required={form.documentType === 'INVOICE'}
                type="date"
                value={(form.dueDate || '').slice(0, 10)}
              />
            </div>
            {form.documentType === 'DISPATCH' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Irsaliye No</label>
                <input
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                  onChange={(event) => setForm({ ...form, dispatchNo: event.target.value })}
                  type="text"
                  value={form.dispatchNo || ''}
                />
              </div>
            )}
          </div>

          <h3 className="pt-4 text-lg font-medium text-white">Fatura Kalemleri</h3>

          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <div className="relative mb-6">
              <label className="mb-1 block text-sm font-medium text-gray-300">Urun ekle</label>
              <input
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Urun adi veya barkod girin..."
                type="text"
                value={productSearch}
              />
              {productSearch.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded border border-gray-700 bg-gray-800 shadow-lg">
                  {filteredProducts.map((product) => (
                    <li key={product.id}>
                      <button
                        className="flex w-full justify-between px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                        onClick={() => handleAddItem(product)}
                        type="button"
                      >
                        <span>
                          {product.name} <span className="text-gray-500">({product.barcode})</span>
                        </span>
                        <span>Stok: {product.quantity || 0}</span>
                      </button>
                    </li>
                  ))}
                  {filteredProducts.length === 0 && (
                    <li className="px-4 py-2 text-sm text-gray-500">Urun bulunamadi.</li>
                  )}
                </ul>
              )}
            </div>

            {form.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="pb-2 font-medium">Urun</th>
                      <th className="w-24 pb-2 font-medium">Adet</th>
                      <th className="w-32 pb-2 font-medium">Birim Fiyat</th>
                      <th className="w-32 pb-2 text-right font-medium">Toplam</th>
                      <th className="w-16 pb-2 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item, index) => {
                      const product = products.find((candidate) => candidate.id === item.productId);
                      return (
                        <tr className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30" key={item.productId}>
                          <td className="py-3">{product?.name || item.productId}</td>
                          <td className="py-2">
                            <input
                              className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white outline-none focus:border-teal-500"
                              min="0.01"
                              onChange={(event) => handleUpdateItem(index, 'quantity', Number.parseFloat(event.target.value) || 0)}
                              step="any"
                              type="number"
                              value={item.quantity}
                            />
                          </td>
                          <td className="py-2">
                            <input
                              className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white outline-none focus:border-teal-500"
                              min="0"
                              onChange={(event) => handleUpdateItem(index, 'unitPrice', Number.parseFloat(event.target.value) || 0)}
                              step="any"
                              type="number"
                              value={item.unitPrice}
                            />
                          </td>
                          <td className="py-2 text-right font-medium text-teal-400">{toMoney(item.quantity * item.unitPrice)}</td>
                          <td className="py-2 text-right">
                            <button
                              className="text-red-500 hover:text-red-400"
                              onClick={() => handleRemoveItem(index)}
                              title="Kaldir"
                              type="button"
                            >
                              <svg className="mx-auto h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6 rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">Notlar</label>
              <textarea
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                rows={3}
                value={form.note}
              />
            </div>

            <div className="flex flex-col items-end gap-3">
              <div className="flex w-64 justify-between text-gray-300">
                <span>Ara Toplam:</span>
                <span>{toMoney(calculateSubTotal())}</span>
              </div>
              <div className="flex w-64 items-center justify-between text-gray-300">
                <span>Toplam KDV:</span>
                <input
                  className="w-24 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-right text-white outline-none focus:border-teal-500"
                  onChange={(event) => setForm({ ...form, taxTotal: Number.parseFloat(event.target.value) || 0 })}
                  placeholder="KDV"
                  step="any"
                  type="number"
                  value={form.taxTotal}
                />
              </div>
              <div className="flex w-64 justify-between border-t border-gray-700 pt-3 text-lg font-bold text-teal-400">
                <span>Genel Toplam:</span>
                <span>{toMoney(calculateSubTotal() + form.taxTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              className="rounded border border-gray-700 bg-transparent px-4 py-2 font-medium text-gray-300 hover:bg-gray-800"
              onClick={onCancel}
              type="button"
            >
              Iptal
            </button>
            <button
              className="rounded bg-teal-600 px-6 py-2 font-medium text-white hover:bg-teal-500 disabled:opacity-50"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Kaydediliyor...' : 'Belgeyi Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
