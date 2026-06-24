import React, { useState } from 'react';

import { PaginationControls } from '../../components/PaginationControls';
import type { PurchaseInvoice } from '../../domain/invoices/api';
import { toLocalDateIso } from '../../lib/format';

interface PurchaseInvoiceListPageProps {
  convertingInvoiceId?: string | null;
  invoices: PurchaseInvoice[];
  isLoading: boolean;
  onAddClick: () => void;
  onConvertClick: (invoiceId: string) => Promise<void> | void;
  onPageChange: (newPage: number) => void;
  onViewClick: (invoiceId: string) => void;
  page: number;
  toMoney: (value: number) => string;
  totalItems: number;
}

export function PurchaseInvoiceListPage({
  convertingInvoiceId,
  invoices,
  isLoading,
  onAddClick,
  onConvertClick,
  onPageChange,
  onViewClick,
  page,
  toMoney,
  totalItems,
}: PurchaseInvoiceListPageProps): React.ReactElement {
  const [search, setSearch] = useState('');

  const filteredInvoices = invoices.filter((invoice) =>
    invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    (invoice.dispatchNumber ? invoice.dispatchNumber.toLowerCase().includes(search.toLowerCase()) : false) ||
    (invoice.supplier?.name ? invoice.supplier.name.toLowerCase().includes(search.toLowerCase()) : false),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Alis Faturalari</h2>
          <p className="text-sm text-gray-400">Tedarikcilerden alinan fatura ve stok giris kayitlari</p>
        </div>
        <button
          className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-500"
          onClick={onAddClick}
          type="button"
        >
          Yeni Fatura Gir
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 text-sm">
        <div className="mb-4">
          <input
            className="w-full max-w-sm rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-400 focus:border-teal-500 focus:outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Fatura no veya tedarikci ara..."
            type="text"
            value={search}
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-gray-500">Yukleniyor...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="py-10 text-center text-gray-500">Fatura bulunamadi.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-800 bg-gray-900 shadow">
            <table className="w-full text-left text-gray-300">
              <thead className="border-b border-gray-800 bg-gray-950 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Tarih</th>
                  <th className="px-4 py-3 font-medium">Tip</th>
                  <th className="px-4 py-3 font-medium">Belge No</th>
                  <th className="px-4 py-3 font-medium">Tedarikci</th>
                  <th className="px-4 py-3 font-medium">Baglanti</th>
                  <th className="px-4 py-3 text-right font-medium">Ara Toplam</th>
                  <th className="px-4 py-3 text-right font-medium">KDV</th>
                  <th className="px-4 py-3 text-right font-medium">Genel Toplam</th>
                  <th className="px-4 py-3 text-center font-medium">Durum</th>
                  <th className="px-4 py-3 text-right font-medium">Islem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredInvoices.map((invoice) => (
                  <tr className="hover:bg-gray-800/50" key={invoice.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-white">{toLocalDateIso(new Date(invoice.createdAt))}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-400">
                      {invoice.documentType === 'ORDER'
                        ? 'Siparis'
                        : invoice.documentType === 'DISPATCH'
                          ? 'Irsaliye'
                          : 'Fatura'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                      {invoice.documentType === 'DISPATCH' && invoice.dispatchNumber
                        ? invoice.dispatchNumber
                        : invoice.invoiceNumber}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-400">{invoice.supplier?.name || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-400">
                      {invoice.sourceDispatchId ? `Irsaliye: ${invoice.sourceDispatchId}` : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-400">{toMoney(invoice.subtotal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-400">{toMoney(invoice.totalVat)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-teal-400">{toMoney(invoice.grandTotal)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      {invoice.status === 'COMPLETED' ? (
                        <span className="rounded bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-400">Tamamlandi</span>
                      ) : (
                        <span className="rounded bg-gray-500/10 px-2 py-1 text-xs font-medium text-gray-400">{invoice.status}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {invoice.documentType === 'DISPATCH' && !invoice.convertedToInvoiceId && (
                        <button
                          className="mr-3 text-amber-400 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={convertingInvoiceId === invoice.id}
                          onClick={() => onConvertClick(invoice.id)}
                          type="button"
                        >
                          {convertingInvoiceId === invoice.id ? 'Donusuyor...' : 'Faturaya Donustur'}
                        </button>
                      )}
                      {invoice.documentType === 'DISPATCH' && invoice.convertedToInvoiceId && (
                        <span className="mr-3 rounded bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-400">
                          Faturalasti
                        </span>
                      )}
                      <button
                        className="text-teal-500 hover:text-teal-400"
                        onClick={() => onViewClick(invoice.id)}
                        type="button"
                      >
                        Incele
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800 bg-gray-900 p-4">
        <PaginationControls onPageChange={onPageChange} page={page} pageSize={50} total={totalItems} />
      </div>
    </div>
  );
}
