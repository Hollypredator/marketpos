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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Tedarikciler</h2>
          <p className="text-sm text-gray-400">Urun alimi yaptiginiz toptanci ve firmalar</p>
        </div>
        <button
          className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-500"
          onClick={onAddClick}
          type="button"
        >
          Yeni Tedarikci
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 text-sm">
        <div className="mb-4">
          <input
            className="w-full max-w-sm rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-400 focus:border-teal-500 focus:outline-none"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Isim veya Vergi No ara..."
            type="text"
            value={search}
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-gray-500">Yukleniyor...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="py-10 text-center text-gray-500">Tedarikci bulunamadi.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-800 bg-gray-900 shadow">
            <table className="w-full text-left text-gray-300">
              <thead className="border-b border-gray-800 bg-gray-950 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Tedarikci Adi</th>
                  <th className="px-4 py-3 font-medium">Vergi No</th>
                  <th className="px-4 py-3 font-medium">Telefon</th>
                  <th className="px-4 py-3 text-right font-medium">Guncel Bakiye</th>
                  <th className="px-4 py-3 text-right font-medium">Islemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredSuppliers.map((supplier) => (
                  <tr className="hover:bg-gray-800/50" key={supplier.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{supplier.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-400">{supplier.taxNumber || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-400">{supplier.phone || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <span
                        className={
                          supplier.balance < 0
                            ? 'font-medium text-red-400'
                            : supplier.balance > 0
                              ? 'font-medium text-teal-400'
                              : 'text-gray-400'
                        }
                      >
                        {toMoney(supplier.balance)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        className="mr-3 text-indigo-400 hover:text-indigo-300"
                        onClick={() => onLedgerClick(supplier)}
                        type="button"
                      >
                        Hareket
                      </button>
                      <button
                        className="mr-3 text-teal-500 hover:text-teal-400"
                        onClick={() => onEditClick(supplier)}
                        type="button"
                      >
                        Duzenle
                      </button>
                      <button
                        className="text-red-500 hover:text-red-400"
                        onClick={() => {
                          if (window.confirm('Tedarikci silinsin mi?')) {
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
      </div>

      <div className="border-t border-gray-800 bg-gray-900 p-4">
        <PaginationControls onPageChange={onPageChange} page={page} pageSize={50} total={totalItems} />
      </div>
    </div>
  );
}
