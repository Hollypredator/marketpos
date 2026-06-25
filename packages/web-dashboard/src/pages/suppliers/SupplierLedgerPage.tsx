import React, { useState } from 'react';

import { PaginationControls } from '../../components/PaginationControls';
import type { PaginationMeta } from '../../domain/shared/types';
import type { Supplier, SupplierTransaction } from '../../domain/suppliers/api';
import { toDateTime } from '../../lib/format';

interface SupplierLedgerPageProps {
  creating: boolean;
  isLoading: boolean;
  ledgerFilters: {
    dateFrom: string;
    dateTo: string;
    type: '' | 'DEBT' | 'PAYMENT';
  };
  onBack: () => void;
  onChangeLedgerFilters: (next: {
    dateFrom: string;
    dateTo: string;
    type: '' | 'DEBT' | 'PAYMENT';
  }) => void;
  onCreateTransaction: (payload: {
    amount: number;
    description?: string;
    type: 'DEBT' | 'PAYMENT';
  }) => Promise<void>;
  onPageChange: (page: number) => void;
  pagination: PaginationMeta;
  supplier: Supplier;
  toMoney: (value: number) => string;
  transactions: SupplierTransaction[];
}

export function SupplierLedgerPage({
  creating,
  isLoading,
  ledgerFilters,
  onBack,
  onChangeLedgerFilters,
  onCreateTransaction,
  onPageChange,
  pagination,
  supplier,
  toMoney,
  transactions,
}: SupplierLedgerPageProps): React.ReactElement {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [type, setType] = useState<'DEBT' | 'PAYMENT'>('PAYMENT');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorText('Tutar 0 dan büyük olmalı.');
      return;
    }
    setErrorText(null);
    await onCreateTransaction({
      amount: parsedAmount,
      description: description.trim().length > 0 ? description.trim() : undefined,
      type,
    });
    setAmount('');
    setDescription('');
  };

  return (
    <section className="panel-grid">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button className="btn" onClick={onBack} type="button">
          ← Geri
        </button>
        <div>
          <h2>Tedarikçi Hareketleri</h2>
          <p className="muted">
            {supplier.name} | Güncel Bakiye: {toMoney(supplier.balance)}
          </p>
        </div>
      </div>

      <div className="panel-grid two-col">
        <article className="card" style={{ alignSelf: 'flex-start' }}>
          <h3>Yeni Hareket</h3>
          <p className="muted" style={{ marginBottom: '10px' }}>Tedarikçi hesabı için manuel borç/ödeme fişi girin.</p>
          <form className="form-grid compact" onSubmit={handleSubmit}>
            {errorText && <div className="banner error">{errorText}</div>}
            <select
              onChange={(event) => setType(event.target.value as 'DEBT' | 'PAYMENT')}
              value={type}
            >
              <option value="PAYMENT">Ödeme (Borç Azalt)</option>
              <option value="DEBT">Ek Borç (Verecek Artır)</option>
            </select>
            <input
              min="0.01"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Tutar"
              step="0.01"
              type="number"
              value={amount}
            />
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Açıklama"
              rows={3}
              value={description}
            />
            <button
              className="btn primary"
              style={{ width: '100%' }}
              disabled={creating}
              type="submit"
            >
              {creating ? 'Kaydediliyor...' : 'Hareket Kaydet'}
            </button>
          </form>
        </article>

        <article className="card">
          <div className="inline-row three" style={{ marginBottom: '14px' }}>
            <select
              onChange={(event) =>
                onChangeLedgerFilters({
                  ...ledgerFilters,
                  type: event.target.value as '' | 'DEBT' | 'PAYMENT',
                })
              }
              value={ledgerFilters.type}
            >
              <option value="">Tüm Tipler</option>
              <option value="DEBT">Borç</option>
              <option value="PAYMENT">Ödeme</option>
            </select>
            <input
              onChange={(event) =>
                onChangeLedgerFilters({
                  ...ledgerFilters,
                  dateFrom: event.target.value,
                })
              }
              type="date"
              value={ledgerFilters.dateFrom}
            />
            <input
              onChange={(event) =>
                onChangeLedgerFilters({
                  ...ledgerFilters,
                  dateTo: event.target.value,
                })
              }
              type="date"
              value={ledgerFilters.dateTo}
            />
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Tip</th>
                  <th>Belge</th>
                  <th>Açıklama</th>
                  <th style={{ textAlign: 'right' }}>Tutar</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="muted" style={{ textAlign: 'center', padding: '20px' }} colSpan={5}>
                      Yükleniyor...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td className="muted" style={{ textAlign: 'center', padding: '20px' }} colSpan={5}>
                      Henüz hareket yok.
                    </td>
                  </tr>
                ) : (
                  transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>{toDateTime(transaction.createdAt)}</td>
                      <td>
                        <span className={`pill ${transaction.type === 'PAYMENT' ? 'red' : 'green'}`}>
                          {transaction.type === 'PAYMENT' ? 'Ödeme' : 'Borç'}
                        </span>
                      </td>
                      <td className="muted">
                        {transaction.invoice
                          ? `${transaction.invoice.invoiceNumber} (${transaction.invoice.documentType})`
                          : '-'}
                      </td>
                      <td>{transaction.description || '-'}</td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 500,
                          color: transaction.type === 'PAYMENT' ? 'var(--red)' : 'var(--emerald)'
                        }}
                      >
                        {transaction.type === 'PAYMENT' ? '-' : '+'}
                        {toMoney(transaction.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '14px' }}>
            <PaginationControls
              onPageChange={onPageChange}
              page={pagination.page}
              pageSize={pagination.limit}
              total={pagination.total}
            />
          </div>
        </article>
      </div>
    </section>
  );
}
