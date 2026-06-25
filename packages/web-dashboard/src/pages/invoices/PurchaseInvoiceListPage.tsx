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
    <article className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Alış Faturaları</h2>
          <p className="card-sub">Tedarikçilerden alınan fatura ve stok giriş kayıtları</p>
        </div>
        <button
          className="btn primary"
          onClick={onAddClick}
          type="button"
        >
          Yeni Fatura Gir
        </button>
      </div>

      <div className="form-grid compact" style={{ marginBottom: '14px' }}>
        <div style={{ maxWidth: '320px' }}>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Fatura no veya tedarikçi ara..."
            type="text"
            value={search}
          />
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--fg-4)' }}>Yükleniyor...</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">📄</span>
          <span className="empty-state-title">Fatura bulunamadı</span>
          <span className="empty-state-sub">Arama kriterlerine uyan fatura kaydı bulunmuyor.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Tip</th>
                <th>Belge No</th>
                <th>Tedarikçi</th>
                <th>Bağlantı</th>
                <th style={{ textAlign: 'right' }}>Ara Toplam</th>
                <th style={{ textAlign: 'right' }}>KDV</th>
                <th style={{ textAlign: 'right' }}>Genel Toplam</th>
                <th style={{ textAlign: 'center' }}>Durum</th>
                <th style={{ textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{toLocalDateIso(new Date(invoice.createdAt))}</td>
                  <td>
                    {invoice.documentType === 'ORDER'
                      ? 'Sipariş'
                      : invoice.documentType === 'DISPATCH'
                        ? 'İrsaliye'
                        : 'Fatura'}
                  </td>
                  <td style={{ fontWeight: 500, color: 'var(--fg-1)' }}>
                    {invoice.documentType === 'DISPATCH' && invoice.dispatchNumber
                      ? invoice.dispatchNumber
                      : invoice.invoiceNumber}
                  </td>
                  <td>{invoice.supplier?.name || '-'}</td>
                  <td>
                    {invoice.sourceDispatchId ? `İrsaliye: ${invoice.sourceDispatchId}` : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{toMoney(invoice.subtotal)}</td>
                  <td style={{ textAlign: 'right' }}>{toMoney(invoice.totalVat)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--accent-v)' }}>{toMoney(invoice.grandTotal)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      className={`pill ${invoice.status === 'COMPLETED' ? 'green' : 'gray'}`}
                    >
                      {invoice.status === 'COMPLETED' ? 'Tamamlandı' : invoice.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {invoice.documentType === 'DISPATCH' && !invoice.convertedToInvoiceId && (
                      <button
                        className="btn ghost"
                        style={{ marginRight: '6px', color: 'var(--amber)' }}
                        disabled={convertingInvoiceId === invoice.id}
                        onClick={() => onConvertClick(invoice.id)}
                        type="button"
                      >
                        {convertingInvoiceId === invoice.id ? 'Dönüşüyor...' : 'Faturaya Dönüştür'}
                      </button>
                    )}
                    {invoice.documentType === 'DISPATCH' && invoice.convertedToInvoiceId && (
                      <span className="pill green" style={{ marginRight: '6px' }}>
                        Faturalaştı
                      </span>
                    )}
                    <button
                      className="btn ghost"
                      onClick={() => onViewClick(invoice.id)}
                      type="button"
                    >
                      İncele
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '14px' }}>
        <PaginationControls onPageChange={onPageChange} page={page} pageSize={50} total={totalItems} />
      </div>
    </article>
  );
}
