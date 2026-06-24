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
      setErrorText('Tutar 0 dan buyuk olmali.');
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
    <div className="flex h-full flex-col bg-gray-900">
      <div className="flex items-center border-b border-gray-800 px-6 py-4">
        <button className="mr-4 text-gray-400 hover:text-white" onClick={onBack} type="button">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M10 19l-7-7m0 0l7-7m-7 7h18" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          </svg>
        </button>
        <div>
          <h2 className="text-xl font-semibold text-white">Tedarikci Hareketleri</h2>
          <p className="text-sm text-gray-400">
            {supplier.name} | Guncel Bakiye: {toMoney(supplier.balance)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        <form className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4" onSubmit={handleSubmit}>
          <h3 className="text-sm font-semibold text-white">Yeni Hareket</h3>
          {errorText && <div className="banner error">{errorText}</div>}
          <select
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
            onChange={(event) => setType(event.target.value as 'DEBT' | 'PAYMENT')}
            value={type}
          >
            <option value="PAYMENT">Odeme (Borc Azalt)</option>
            <option value="DEBT">Ek Borc (Verecek Artir)</option>
          </select>
          <input
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
            min="0.01"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Tutar"
            step="0.01"
            type="number"
            value={amount}
          />
          <textarea
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Aciklama"
            rows={3}
            value={description}
          />
          <button
            className="w-full rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50"
            disabled={creating}
            type="submit"
          >
            {creating ? 'Kaydediliyor...' : 'Hareket Kaydet'}
          </button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/50 lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 border-b border-gray-800 px-4 py-3 lg:grid-cols-3">
            <select
              className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
              onChange={(event) =>
                onChangeLedgerFilters({
                  ...ledgerFilters,
                  type: event.target.value as '' | 'DEBT' | 'PAYMENT',
                })
              }
              value={ledgerFilters.type}
            >
              <option value="">Tum Tipler</option>
              <option value="DEBT">Borc</option>
              <option value="PAYMENT">Odeme</option>
            </select>
            <input
              className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
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
              className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-teal-500"
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
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="border-b border-gray-800 bg-gray-950 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">Belge</th>
                <th className="px-4 py-3">Aciklama</th>
                <th className="px-4 py-3 text-right">Tutar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500" colSpan={5}>
                    Yukleniyor...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500" colSpan={5}>
                    Henuz hareket yok.
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-4 py-3">{toDateTime(transaction.createdAt)}</td>
                    <td className="px-4 py-3">
                      {transaction.type === 'PAYMENT' ? 'Odeme' : 'Borc'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {transaction.invoice
                        ? `${transaction.invoice.invoiceNumber} (${transaction.invoice.documentType})`
                        : '-'}
                    </td>
                    <td className="px-4 py-3">{transaction.description || '-'}</td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        transaction.type === 'PAYMENT' ? 'text-red-400' : 'text-teal-400'
                      }`}
                    >
                      {transaction.type === 'PAYMENT' ? '-' : '+'}
                      {toMoney(transaction.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="border-t border-gray-800 p-4">
            <PaginationControls
              onPageChange={onPageChange}
              page={pagination.page}
              pageSize={pagination.limit}
              total={pagination.total}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
