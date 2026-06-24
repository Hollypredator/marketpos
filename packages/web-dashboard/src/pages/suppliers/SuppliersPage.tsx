import React, { useEffect, useMemo, useState } from 'react';

import type { Supplier, SupplierForm } from '../../domain/suppliers/api';
import {
  useSupplierMutations,
  useSupplierTransactionsQuery,
  useSuppliersQuery,
} from '../../domain/suppliers/hooks';
import { PurchaseInvoicesPage } from '../invoices/PurchaseInvoicesPage';
import { SupplierFormPage } from './SupplierFormPage';
import { SupplierLedgerPage } from './SupplierLedgerPage';
import { SupplierListPage } from './SupplierListPage';

interface SuppliersPageProps {
  branchId: string;
  companyId: string;
  products: any[];
  toMoney: (value: number) => string;
}

export function SuppliersPage({ branchId, companyId, products, toMoney }: SuppliersPageProps): React.ReactElement {
  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'suppliers'>('suppliers');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerFilters, setLedgerFilters] = useState<{
    dateFrom: string;
    dateTo: string;
    type: '' | 'DEBT' | 'PAYMENT';
  }>({
    dateFrom: '',
    dateTo: '',
    type: '',
  });
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSuppliersQuery(companyId, page);
  const ledgerQueryFilters = useMemo(
    () => ({
      dateFrom: ledgerFilters.dateFrom
        ? new Date(`${ledgerFilters.dateFrom}T00:00:00.000Z`).toISOString()
        : undefined,
      dateTo: ledgerFilters.dateTo
        ? new Date(`${ledgerFilters.dateTo}T23:59:59.999Z`).toISOString()
        : undefined,
      limit: 50,
      page: ledgerPage,
      type: ledgerFilters.type || undefined,
    }),
    [ledgerFilters.dateFrom, ledgerFilters.dateTo, ledgerFilters.type, ledgerPage],
  );
  const { data: transactions, isLoading: isTransactionsLoading } = useSupplierTransactionsQuery(
    ledgerSupplier?.id ?? '',
    ledgerQueryFilters,
  );
  const {
    createSupplier,
    createSupplierTransaction,
    deleteSupplier,
    isCreating,
    isCreatingTransaction,
    isUpdating,
    updateSupplier,
  } = useSupplierMutations();

  useEffect(() => {
    if (!ledgerSupplier) {
      return;
    }
    const refreshed = data?.data.find((supplier) => supplier.id === ledgerSupplier.id) ?? null;
    if (
      refreshed &&
      (refreshed.balance !== ledgerSupplier.balance ||
        refreshed.name !== ledgerSupplier.name ||
        refreshed.updatedAt !== ledgerSupplier.updatedAt)
    ) {
      setLedgerSupplier(refreshed);
    }
  }, [data?.data, ledgerSupplier]);

  const handleAddClick = (): void => {
    setEditingSupplier(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (supplier: Supplier): void => {
    setEditingSupplier(supplier);
    setIsFormOpen(true);
  };

  const handleLedgerClick = (supplier: Supplier): void => {
    setErrorText(null);
    setLedgerPage(1);
    setLedgerFilters({
      dateFrom: '',
      dateTo: '',
      type: '',
    });
    setLedgerSupplier(supplier);
  };

  const handleDeleteClick = async (supplier: Supplier): Promise<void> => {
    try {
      setErrorText(null);
      await deleteSupplier(supplier.id);
    } catch {
      setErrorText('Tedarikci silinirken hata olustu.');
    }
  };

  const handleSave = async (form: SupplierForm): Promise<void> => {
    try {
      setErrorText(null);
      if (editingSupplier) {
        await updateSupplier({ id: editingSupplier.id, payload: form });
      } else {
        await createSupplier({ companyId, payload: form });
      }
      setIsFormOpen(false);
    } catch {
      setErrorText('Tedarikci kaydedilirken hata olustu.');
    }
  };

  const handleCreateTransaction = async (payload: {
    amount: number;
    description?: string;
    type: 'DEBT' | 'PAYMENT';
  }): Promise<void> => {
    if (!ledgerSupplier) {
      return;
    }
    try {
      setErrorText(null);
      await createSupplierTransaction({
        payload,
        supplierId: ledgerSupplier.id,
      });
    } catch {
      setErrorText('Tedarikci hareketi kaydedilemedi.');
    }
  };

  if (isFormOpen) {
    return (
      <SupplierFormPage
        initialData={
          editingSupplier
            ? {
                address: editingSupplier.address ?? '',
                email: editingSupplier.email ?? '',
                name: editingSupplier.name,
                phone: editingSupplier.phone ?? '',
                taxNumber: editingSupplier.taxNumber ?? '',
              }
            : null
        }
        onCancel={() => setIsFormOpen(false)}
        onSave={handleSave}
        saving={isCreating || isUpdating}
      />
    );
  }

  if (ledgerSupplier) {
    return (
      <SupplierLedgerPage
        creating={isCreatingTransaction}
        isLoading={isTransactionsLoading}
        ledgerFilters={ledgerFilters}
        onBack={() => setLedgerSupplier(null)}
        onChangeLedgerFilters={(next) => {
          setLedgerFilters(next);
          setLedgerPage(1);
        }}
        onCreateTransaction={handleCreateTransaction}
        onPageChange={setLedgerPage}
        pagination={
          transactions?.pagination ?? {
            limit: 50,
            page: ledgerPage,
            total: 0,
            totalPages: 1,
          }
        }
        supplier={ledgerSupplier}
        toMoney={toMoney}
        transactions={transactions?.data ?? []}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3">
        {errorText && <div className="banner error">{errorText}</div>}
        <nav className="-mb-3 flex space-x-8" aria-label="Tabs">
          <button
            className={`whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium ${
              activeSubTab === 'suppliers'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setActiveSubTab('suppliers')}
            type="button"
          >
            Tedarikciler
          </button>
          <button
            className={`whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium ${
              activeSubTab === 'invoices'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setActiveSubTab('invoices')}
            type="button"
          >
            Alis Faturalari
          </button>
        </nav>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'suppliers' ? (
          <SupplierListPage
            isLoading={isLoading}
            onAddClick={handleAddClick}
            onDeleteClick={handleDeleteClick}
            onEditClick={handleEditClick}
            onLedgerClick={handleLedgerClick}
            onPageChange={setPage}
            page={page}
            suppliers={data?.data ?? []}
            toMoney={toMoney}
            totalItems={data?.pagination?.total ?? 0}
          />
        ) : (
          <PurchaseInvoicesPage branchId={branchId} companyId={companyId} products={products} toMoney={toMoney} />
        )}
      </div>
    </div>
  );
}
