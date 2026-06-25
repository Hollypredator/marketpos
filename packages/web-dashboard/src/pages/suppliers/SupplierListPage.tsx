import React, { useState } from 'react';

import { PaginationControls } from '../../components/PaginationControls';
import type { Supplier } from '../../domain/suppliers/api';

interface SupplierListPageProps {
  isLoading: boolean;
  onAddClick: () => void;
  onDeleteClick: (supplier: Supplier) => void;
  onEditClick: (supplier: Supplier) => void;
  onLedgerClick: (supplier: Supplier) => void;
  onPageChange: (newPage: number) => void;
  page: number;
  suppliers: Supplier[];
  toMoney: (value: number) => string;
  totalItems: number;
}

export function SupplierListPage({
  isLoading,
  onAddClick,
  onDeleteClick,
  onEditClick,
  onLedgerClick,
  onPageChange,
  page,
  suppliers,
  toMoney,
  totalItems,
}: SupplierListPageProps): React.ReactElement {
  const [search, setSearch] = useState('');

  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.name.toLowerCase().includes(search.toLowerCase()) ||
    (supplier.taxNumber ? supplier.taxNumber.includes(search) : false),
  );

  return (
    <article className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Tedarikçiler</h2>
          <p className="card-sub">Ürün alımı yaptığınız toptancı ve firmalar</p>
        </div>
        <button
          className="btn primary"
          onClick={onAddClick}
          type="button"
        >
          Yeni Tedarikçi
        </button>
      </div>

      <div className="form-grid compact" style={{ marginBottom: '14px' }}>
        <div style={{ maxWidth: '320px' }}>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="İsim veya Vergi No ara..."
            type="text"
            value={search}
          />
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--fg-4)' }}>Yükleniyor...</div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">👤</span>
          <span className="empty-state-title">Tedarikçi bulunamadı</span>
          <span className="empty-state-sub">Arama kriterlerine uyan tedarikçi kaydı bulunmuyor.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tedarikçi Adı</th>
                <th>Vergi No</th>
                <th>Telefon</th>
                <th style={{ textAlign: 'right' }}>Güncel Bakiye</th>
                <th style={{ textAlign: 'right' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td style={{ fontWeight: 500, color: 'var(--fg-1)' }}>{supplier.name}</td>
                  <td>{supplier.taxNumber || '-'}</td>
                  <td>{supplier.phone || '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span
                      className={`pill ${
                        supplier.balance < 0
                          ? 'red'
                          : supplier.balance > 0
                            ? 'green'
                            : 'gray'
                      }`}
                    >
                      {toMoney(supplier.balance)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn ghost"
                      style={{ marginRight: '6px' }}
                      onClick={() => onLedgerClick(supplier)}
                      type="button"
                    >
                      Hareket
                    </button>
                    <button
                      className="btn ghost"
                      style={{ marginRight: '6px', color: 'var(--accent-v)' }}
                      onClick={() => onEditClick(supplier)}
                      type="button"
                    >
                      Düzenle
                    </button>
                    <button
                      className="btn ghost"
                      style={{ color: 'var(--red)' }}
                      onClick={() => {
                        if (window.confirm('Tedarikçi silinsin mi?')) {
                          onDeleteClick(supplier);
                        }
                      }}
                      type="button"
                    >
                      Sil
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
