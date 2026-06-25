import React, { useState } from 'react';

import { PaginationControls } from '../components/PaginationControls';
import type { Sale, Refund } from '../domain/sales/api';

interface SalesPageProps {
  sales: Sale[];
  salesLoading: boolean;
  salesError: string | null;
  salesPagination: { page: number; totalPages: number; total: number };
  onSalesPageChange: (page: number) => void;
  salesFrom: string;
  salesTo: string;
  onSalesFromChange: (value: string) => void;
  onSalesToChange: (value: string) => void;
  onLoadSales: () => void;
  receiptSearch: string;
  onReceiptSearchChange: (value: string) => void;
  onSearchReceipt: () => void;
  selectedSaleId: string;
  onSelectSale: (id: string) => void;
  saleDetail: Sale | null;
  saleDetailLoading: boolean;
  refunds: Refund[];
  refundsLoading: boolean;
  toMoney: (value: number) => string;
  toDateTime: (value?: string | null) => string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Nakit',
  CREDIT_CARD: 'Kredi Kartı',
  DEBIT_CARD: 'Banka Kartı',
  ON_ACCOUNT: 'Cari Hesap',
  MULTI: 'Çoklu',
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: 'Tamamlandı', cls: 'green' },
  PARTIALLY_REFUNDED: { label: 'Kısmi İade', cls: 'amber' },
  REFUNDED: { label: 'İade Edildi', cls: 'red' },
};

export function SalesPage({
  sales,
  salesLoading,
  salesError,
  salesPagination,
  onSalesPageChange,
  salesFrom,
  salesTo,
  onSalesFromChange,
  onSalesToChange,
  onLoadSales,
  receiptSearch,
  onReceiptSearchChange,
  onSearchReceipt,
  selectedSaleId,
  onSelectSale,
  saleDetail,
  saleDetailLoading,
  refunds,
  refundsLoading,
  toMoney,
  toDateTime,
}: SalesPageProps): React.ReactElement {
  const [showRefunds, setShowRefunds] = useState(false);

  const statusInfo = (status?: string) => {
    if (!status) return STATUS_LABELS.COMPLETED;
    return STATUS_LABELS[status] ?? { label: status, cls: '' };
  };

  return (
    <section className="sub-layout-grid">
      {/* Left — List */}
      <div>
        <article className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Satış Geçmişi</div>
              <div className="card-sub">Fiş listesi ve detayları</div>
            </div>
          </div>

          {/* Filters */}
          <div className="inline-row three" style={{ marginBottom: '10px' }}>
            <label>
              Başlangıç
              <input type="date" value={salesFrom} onChange={(e) => onSalesFromChange(e.target.value)} />
            </label>
            <label>
              Bitiş
              <input type="date" value={salesTo} onChange={(e) => onSalesToChange(e.target.value)} />
            </label>
            <div className="report-action">
              <button type="button" className="btn primary" onClick={onLoadSales} disabled={salesLoading}>
                {salesLoading ? 'Yükleniyor...' : 'Satışları Getir'}
              </button>
            </div>
          </div>

          {/* Receipt search */}
          <div className="filter-bar" style={{ marginBottom: '10px' }}>
            <div className="filter-input">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="7" cy="7" r="5"/>
                <path d="M11 11l3.5 3.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder="Fiş numarası ile ara..."
                value={receiptSearch}
                onChange={(e) => onReceiptSearchChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSearchReceipt()}
              />
            </div>
            <button type="button" className="btn" onClick={onSearchReceipt} disabled={receiptSearch.trim().length === 0}>
              Ara
            </button>
          </div>

          {salesError && <div className="banner error">{salesError}</div>}

          <div className="table-wrap tall">
            <table>
              <thead>
                <tr>
                  <th>Fiş No</th>
                  <th>Tarih</th>
                  <th>Tutar</th>
                  <th>Müşteri</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '2rem' }}>
                      {salesLoading ? 'Yükleniyor...' : 'Satış bulunamadı. Tarih aralığı seçip "Satışları Getir" butonuna tıklayın.'}
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => {
                    const si = statusInfo(sale.status);
                    return (
                      <tr
                        key={sale.id}
                        className={sale.id === selectedSaleId ? 'row-selected' : ''}
                        onClick={() => onSelectSale(sale.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{sale.receiptNumber}</td>
                        <td>{toDateTime(sale.createdAt)}</td>
                        <td style={{ fontWeight: 500, color: 'var(--fg-1)' }}>{toMoney(sale.grandTotal)}</td>
                        <td>{sale.customer?.name ?? '—'}</td>
                        <td><span className={`pill ${si.cls}`}>{si.label}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {salesPagination.totalPages > 1 && (
            <PaginationControls
              currentPage={salesPagination.page}
              totalPages={salesPagination.totalPages}
              onNext={() => onSalesPageChange(salesPagination.page + 1)}
              onPrev={() => onSalesPageChange(salesPagination.page - 1)}
              totalItems={salesPagination.total}
            />
          )}
        </article>
      </div>

      {/* Right — Detail */}
      <div>
        {saleDetailLoading ? (
          <article className="card"><p className="muted">Yükleniyor...</p></article>
        ) : saleDetail ? (
          <>
            <article className="card">
              <div className="card-header">
                <div>
                  <div className="card-title" style={{ fontFamily: 'var(--font-mono)' }}>{saleDetail.receiptNumber}</div>
                  <div className="card-sub">{toDateTime(saleDetail.createdAt)}</div>
                </div>
                <span className={`pill ${statusInfo(saleDetail.status).cls}`}>
                  {statusInfo(saleDetail.status).label}
                </span>
              </div>

              {/* KPIs */}
              <div className="metric-grid">
                <div className="metric-card primary">
                  <span>Toplam</span>
                  <strong>{toMoney(saleDetail.grandTotal)}</strong>
                </div>
                <div className="metric-card">
                  <span>KDV</span>
                  <strong>{toMoney(saleDetail.totalVat)}</strong>
                </div>
                <div className="metric-card">
                  <span>İndirim</span>
                  <strong>{toMoney(saleDetail.totalDiscount)}</strong>
                </div>
              </div>

              {/* Meta */}
              <div className="divider" />
              <div className="inline-row" style={{ fontSize: '12px', color: 'var(--fg-3)' }}>
                <div>Kasir: <strong style={{ color: 'var(--fg-2)' }}>{saleDetail.user?.fullName ?? '—'}</strong></div>
                <div>Şube: <strong style={{ color: 'var(--fg-2)' }}>{saleDetail.branch?.name ?? '—'}</strong></div>
              </div>
              <div className="inline-row" style={{ fontSize: '12px', color: 'var(--fg-3)', marginTop: '4px' }}>
                <div>Kasa: <strong style={{ color: 'var(--fg-2)' }}>{saleDetail.register?.name ?? '—'}</strong></div>
                <div>Müşteri: <strong style={{ color: 'var(--fg-2)' }}>{saleDetail.customer?.name ?? 'Genel'}</strong></div>
              </div>
            </article>

            {/* Items */}
            <article className="card" style={{ marginTop: '14px' }}>
              <h2>Ürünler ({saleDetail.items.length})</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th>Adet</th>
                      <th>Birim Fiyat</th>
                      <th>İndirim</th>
                      <th>Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleDetail.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productName}</td>
                        <td>{item.quantity}</td>
                        <td>{toMoney(item.unitPrice)}</td>
                        <td>{item.discount > 0 ? toMoney(item.discount) : '—'}</td>
                        <td style={{ fontWeight: 500 }}>{toMoney(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            {/* Payments */}
            <article className="card" style={{ marginTop: '14px' }}>
              <h2>Ödemeler</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Yöntem</th>
                      <th>Tutar</th>
                      <th>Referans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleDetail.payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className="pill violet">
                            {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                          </span>
                        </td>
                        <td>{toMoney(p.amount)}</td>
                        <td>{p.reference ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            {/* Refunds */}
            <article className="card" style={{ marginTop: '14px' }}>
              <div className="card-header">
                <h2>İadeler</h2>
                <button type="button" className="btn tab" onClick={() => setShowRefunds(!showRefunds)}>
                  {showRefunds ? 'Gizle' : 'Göster'}
                </button>
              </div>
              {showRefunds && (
                refundsLoading ? (
                  <p className="muted">Yükleniyor...</p>
                ) : refunds.length === 0 ? (
                  <p className="muted">Bu satışa ait iade bulunmamaktadır.</p>
                ) : (
                  refunds.map((refund) => (
                    <div key={refund.id} style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--fg-3)', marginBottom: '4px' }}>
                        <span className="pill red">{refund.receiptNumber}</span>
                        <span style={{ marginLeft: '8px' }}>{toMoney(refund.totalAmount)}</span>
                        <span style={{ marginLeft: '8px' }}>{toDateTime(refund.createdAt)}</span>
                      </div>
                      {refund.reason && <p className="muted">Sebep: {refund.reason}</p>}
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr><th>Ürün</th><th>Adet</th><th>Tutar</th></tr>
                          </thead>
                          <tbody>
                            {refund.items.map((ri) => (
                              <tr key={ri.id}>
                                <td>{ri.productName}</td>
                                <td>{ri.quantity}</td>
                                <td>{toMoney(ri.lineTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )
              )}
            </article>
          </>
        ) : (
          <article className="card">
            <div className="empty-state">
              <div className="empty-state-title">Satış seçin</div>
              <div className="empty-state-sub">Sol listeden bir fiş seçerek detaylarını görüntüleyin</div>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
